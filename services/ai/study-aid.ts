'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkStudyAidResponse } from '@/lib/ai/guardrails/study-aid'
import { STUDY_AID_SCHEMA, STUDY_AID_SYSTEM, studyAidInstruction } from '@/lib/ai/prompts/study-aid'
import { aiClient, modelFor } from '@/lib/ai/provider/client'
import { recordUsage } from '@/lib/ai/usage/record'

/**
 * AI study aids: a summary, the key points, and practice questions, built from
 * one piece of material a teacher published.
 *
 * Three things this deliberately is not:
 *
 *   * It is not assessment. Nothing here writes a mark, and the answers are
 *     shown to the student immediately — the opposite of how `assessments`
 *     works, because the point is self-checking rather than examination.
 *   * It is not a replacement for the material. The aid is labelled with what
 *     it was built from, so a student can see when it came from a one-line
 *     description rather than the document itself.
 *   * It is not per-student. One aid per material, shared by the class. Sixty
 *     students revising the same handout would otherwise mean sixty identical
 *     model calls billed sixty times.
 *
 * The source is chosen by what the material actually is. A PDF goes to the
 * model as a PDF and an image as an image, so the summary is built from the
 * document rather than from its filename. What cannot be read — a .docx, an
 * external link — falls back to the teacher's own text and says so.
 */

export type StudyQuestion = {
  question: string
  answer: string
  difficulty: 'EASY' | 'MODERATE' | 'HARD'
}

export type StudyAid = {
  id: string
  material_id: string
  summary: string
  key_points: string[]
  questions: StudyQuestion[]
  source_kind: 'NOTE' | 'PDF' | 'IMAGE' | 'DESCRIPTION'
  model: string
  created_at: string
}

/** Beyond this the file is not sent; the teacher's own text is used instead. */
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

const COLUMNS =
  'id, material_id, summary, key_points, questions, source_kind, model, created_at'

/**
 * The stored aid for a material, if one has been made.
 *
 * No visibility filter here and none needed: `study_aids_select` calls
 * `private.can_read_material()`, which mirrors `materials_select`. A student
 * who cannot open the material reads no aid for it however this is queried.
 */
export async function getStudyAid(materialId: string): Promise<StudyAid | null> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('material_study_aids')
    .select(COLUMNS)
    .eq('material_id', materialId)
    .maybeSingle()

  if (error) throw error
  return (data as StudyAid | null) ?? null
}

export async function generateStudyAid(input: {
  material_id: string
}): Promise<ActionResult<StudyAid>> {
  return action(async () => {
    const session = await authorize({ permission: 'material.read' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const supabase = await createClient()

    /*
     * Read through the student's own client. `materials_select` is the
     * authorization: a material they cannot see returns no row, and this stops
     * before anything is sent to a model or billed.
     */
    const { data: material, error: materialError } = await supabase
      .from('materials')
      .select(
        'id, title, description, material_type, storage_path, file_name, mime_type, file_size, subjects ( name )',
      )
      .eq('id', input.material_id)
      .maybeSingle()

    if (materialError) throw materialError
    if (!material) throw notFound('material not found')

    // Somebody may have generated it between the page rendering and this call.
    const already = await getStudyAid(input.material_id)
    if (already) return already

    const subject = (material as { subjects?: { name: string } | null }).subjects?.name ?? null
    const text = material.description?.trim() || null

    // ── What can actually be sent ─────────────────────────────────────────
    let sourceKind: StudyAid['source_kind'] = text ? 'NOTE' : 'DESCRIPTION'
    let fileBlock: Record<string, unknown> | null = null

    const mime = material.mime_type ?? ''
    const readable =
      material.material_type === 'DOCUMENT' &&
      material.storage_path &&
      (material.file_size ?? 0) > 0 &&
      (material.file_size ?? 0) <= MAX_DOCUMENT_BYTES &&
      (mime === 'application/pdf' || (IMAGE_TYPES as readonly string[]).includes(mime))

    if (readable) {
      /*
       * The object is fetched with the service role, but only after the read
       * above proved this person may see the material. The bucket policy is
       * tenant-scoped rather than per-student, so it would not have refused
       * them anyway — the check that matters already happened.
       */
      const download = await createAdminClient()
        .storage.from('learning-materials')
        .download(material.storage_path!)

      if (!download.error && download.data) {
        const base64 = Buffer.from(await download.data.arrayBuffer()).toString('base64')

        if (mime === 'application/pdf') {
          sourceKind = 'PDF'
          fileBlock = {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          }
        } else {
          sourceKind = 'IMAGE'
          fileBlock = {
            type: 'image',
            source: { type: 'base64', media_type: mime, data: base64 },
          }
        }
      }
      // A failed download is not a failed feature: fall through to the text.
    }

    const model = modelFor('reasoning')
    let inputTokens = 0
    let outputTokens = 0

    try {
      const instruction = studyAidInstruction({
        title: material.title,
        subject,
        text,
      })

      const response = await aiClient().messages.create({
        model,
        max_tokens: 8000,
        system: STUDY_AID_SYSTEM,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: STUDY_AID_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: (fileBlock
              ? [fileBlock, { type: 'text', text: instruction }]
              : [{ type: 'text', text: instruction }]) as never,
          },
        ],
      })

      inputTokens = response.usage.input_tokens
      outputTokens = response.usage.output_tokens

      if (response.stop_reason === 'refusal') {
        await recordUsage({
          institutionId: session.institutionId,
          actorId: session.userId,
          feature: 'study_aid.generate',
          model,
          inputTokens,
          outputTokens,
          succeeded: false,
          errorCode: 'refusal',
        })

        throw new AppError('VALIDATION', 'model declined', {
          publicMessage:
            'The study assistant declined to summarise this material. Read it directly — nothing has been saved.',
        })
      }

      const block = response.content.find((item) => item.type === 'text')
      if (!block || block.type !== 'text') {
        throw new AppError('INTERNAL', 'no text block in the model response')
      }

      const checked = checkStudyAidResponse(JSON.parse(block.text))

      const { data: stored, error: storeError } = await supabase
        .from('material_study_aids')
        .insert({
          institution_id: session.institutionId,
          material_id: input.material_id,
          summary: checked.summary,
          key_points: checked.key_points,
          questions: checked.questions as never,
          source_kind: sourceKind,
          model,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          requested_by: session.userId,
        })
        .select(COLUMNS)
        .maybeSingle()

      if (storeError) {
        /*
         * Two students pressing at the same moment. The material is unique, so
         * one insert wins and the other reads what it produced rather than
         * reporting a conflict nobody caused — and rather than paying for a
         * third call.
         */
        if (storeError.code === '23505') {
          const theirs = await getStudyAid(input.material_id)
          if (theirs) return theirs
        }
        throw storeError
      }
      if (!stored) throw new AppError('INTERNAL', 'study aid not stored')

      await recordUsage({
        institutionId: session.institutionId,
        actorId: session.userId,
        feature: 'study_aid.generate',
        model,
        inputTokens,
        outputTokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        succeeded: true,
      })

      revalidatePath('/student/materials')
      return stored as StudyAid
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown

      await recordUsage({
        institutionId: session.institutionId,
        actorId: session.userId,
        feature: 'study_aid.generate',
        model,
        inputTokens,
        outputTokens,
        succeeded: false,
        errorCode: thrown instanceof Error ? thrown.name : 'unknown',
      })

      /*
       * Two provider failures deserve their own message, because the remedy
       * belongs to an administrator rather than the student. "Could not be
       * reached" would send a student to check their wifi when the institution's
       * account is out of credit.
       */
      const detail = thrown instanceof Error ? thrown.message : ''

      if (/credit balance|billing|quota|payment/i.test(detail)) {
        throw new AppError('CONFIGURATION', 'ai account has no credit', {
          publicMessage:
            'The study assistant is unavailable: your institution’s AI account has no remaining credit. Ask your teacher to have it topped up.',
        })
      }

      if (/authentication|invalid.*api.?key|401/i.test(detail)) {
        throw new AppError('CONFIGURATION', 'ai credentials rejected', {
          publicMessage:
            'The study assistant is not configured correctly. Tell your teacher — nothing has been saved.',
        })
      }

      throw new AppError('INTERNAL', 'study aid generation failed', {
        publicMessage:
          'The study assistant could not be reached. Try again shortly — nothing has been saved.',
      })
    }
  })
}
