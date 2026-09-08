'use server'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import { contentFileSchema, materialSchema } from '@/lib/validation/teaching'

/**
 * Study material, from the teacher's side.
 *
 * Authorship is never accepted from the request. `teacher_id` is the acting
 * teacher's own id, taken from their session, and the RLS WITH CHECK on
 * `materials_insert` requires `teacher_id = auth.uid()` independently — so
 * publishing under a colleague's name is refused twice, by two mechanisms that
 * do not share an assumption.
 *
 * Reads are the same story in reverse. `materials_select` returns a teacher
 * their own rows, published rows to the students they were addressed to, and
 * nothing else. A query here that forgot to filter by teacher would still not
 * return another teacher's drafts.
 */

export type MaterialRow = {
  id: string
  title: string
  description: string | null
  material_type: string
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  external_url: string | null
  storage_path: string | null
  is_published: boolean
  published_at: string | null
  created_at: string
  class_id: string
  section_id: string | null
  classes: { name: string } | null
  sections: { name: string } | null
  subjects: { name: string } | null
}

const SELECT = `id, title, description, material_type, file_name, file_size, mime_type, external_url,
  storage_path, is_published, published_at, created_at, class_id, section_id,
  classes ( name ), sections ( name ), subjects ( name )`

/** Everything the acting teacher has authored. */
export async function listOwnMaterials(options: {
  classId?: string
  published?: boolean
} = {}): Promise<MaterialRow[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  let query = supabase
    .from('materials')
    .select(SELECT)
    // Redundant against `materials_select`, and kept: if that policy were ever
    // loosened, this query would still return only this teacher's own work.
    .eq('teacher_id', session.userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (options.classId) query = query.eq('class_id', options.classId)
  if (options.published !== undefined) query = query.eq('is_published', options.published)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as MaterialRow[]
}

export async function getOwnMaterial(id: string): Promise<MaterialRow | null> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('materials')
    .select(SELECT)
    .eq('id', id)
    .eq('teacher_id', session.userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as unknown as MaterialRow | null
}

export async function createMaterial(
  input: unknown,
): Promise<ActionResult<{ id: string; published: boolean }>> {
  return action(async () => {
    const session = await authorize({ permission: 'material.manage' })
    if (!session.institutionId) {
      throw new AppError('TENANT_MISMATCH', 'material belongs to an institution')
    }

    const parsed = materialSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'material rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const values = parsed.data
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('materials')
      .insert({
        institution_id: session.institutionId,
        // Authorship from the session, never from the payload.
        teacher_id: session.userId,
        class_id: values.class_id,
        section_id: values.section_id ?? null,
        subject_id: values.subject_id ?? null,
        academic_year_id: values.academic_year_id,
        title: values.title,
        description: values.description ?? null,
        material_type: values.material_type,
        external_url: values.external_url ?? null,
        is_published: values.is_published,
        // Stamped here. A client-supplied "published at" is a claim.
        published_at: values.is_published ? new Date().toISOString() : null,
      })
      .select('id, is_published')
      .single()

    if (error) {
      // 42501 from the WITH CHECK means the teacher does not teach that class.
      if (error.code === '42501') {
        throw new AppError('FORBIDDEN', 'not assigned to that class', {
          publicMessage:
            'You are not assigned to that class. Ask your institution administrator to add it.',
        })
      }
      // 23514 is `materials_payload_coherent` — a shape the type does not allow.
      if (error.code === '23514') {
        throw new AppError('VALIDATION', error.message, {
          publicMessage: 'A document needs a file, a link needs a URL, and a note needs content.',
        })
      }
      throw error
    }

    revalidatePath('/teacher/materials')
    return { id: data.id, published: data.is_published }
  })
}

/**
 * Mints a signed upload URL for a material's file.
 *
 * The object is written under `{institution_id}/materials/{material_id}/...`,
 * which is the prefix the storage policies key on. The service role signs it
 * because `authenticated` holds no standing write grant on the bucket — the
 * server decides one path at a time rather than opening the bucket.
 */
export async function requestMaterialUpload(input: {
  material_id: string
  file_name: string
  mime_type: string
  file_size: number
}): Promise<ActionResult<{ uploadUrl: string; token: string; path: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'material.manage' })

    const parsed = contentFileSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'file rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()

    // Ownership is confirmed by reading the row through the caller's own client:
    // if RLS does not return it, it is not theirs to attach a file to.
    const { data: material } = await supabase
      .from('materials')
      .select('id, institution_id')
      .eq('id', input.material_id)
      .eq('teacher_id', session.userId)
      .maybeSingle()

    if (!material) throw notFound('material not found')

    const extension = parsed.data.file_name.includes('.')
      ? parsed.data.file_name.split('.').pop()!.toLowerCase()
      : 'bin'
    const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'bin'
    const path = `${material.institution_id}/materials/${material.id}/${randomBytes(12).toString('hex')}.${safeExtension}`

    const admin = createAdminClient()
    const { data: signed, error: signError } = await admin.storage
      .from('learning-materials')
      .createSignedUploadUrl(path)

    if (signError || !signed) {
      throw new AppError('STORAGE', signError?.message ?? 'could not prepare the upload')
    }

    /*
     * The row is NOT updated here. It used to be, and that was wrong: the
     * columns were written before the browser had sent a single byte, so an
     * upload that then failed — a dropped connection, a rejected type — left a
     * material advertising a file that did not exist. A student pressing
     * Download got an error for a file nobody had ever uploaded.
     *
     * `attachMaterialFile` records it afterwards, once the object is really
     * there. A ticket nobody uses now leaves nothing behind but an unused
     * signature.
     */
    return { uploadUrl: signed.signedUrl, token: signed.token, path }
  })
}

/**
 * Records a file against a material, once the object is actually in storage.
 *
 * The existence check is the point. Without it this is just an endpoint that
 * writes whatever path a client claims, and the ordering bug it fixes would
 * come straight back the first time an upload failed silently. The object is
 * confirmed with the service role, because the row is what grants students a
 * download and it should not be written on a promise.
 */
export async function attachMaterialFile(input: {
  material_id: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number
}): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'material.manage' })

    const parsed = contentFileSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'file rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()

    const { data: material } = await supabase
      .from('materials')
      .select('id, institution_id')
      .eq('id', input.material_id)
      .eq('teacher_id', session.userId)
      .maybeSingle()

    if (!material) throw notFound('material not found')

    /*
     * The path must be inside this material's own prefix. A caller that sent
     * somebody else's path would otherwise point their material at another
     * institution's object — the storage policy would still refuse the
     * download, but the row would be a lie either way.
     */
    const prefix = `${material.institution_id}/materials/${material.id}/`
    if (!input.storage_path.startsWith(prefix)) {
      throw new AppError('FORBIDDEN', 'path outside the material', {
        publicMessage: 'That file does not belong to this material.',
      })
    }

    const admin = createAdminClient()
    const { data: listed, error: listError } = await admin.storage
      .from('learning-materials')
      .list(prefix.slice(0, -1), { search: input.storage_path.split('/').pop() })

    if (listError) throw new AppError('STORAGE', listError.message)
    if (!listed || listed.length === 0) {
      throw new AppError('STORAGE', 'object not found', {
        publicMessage: 'The upload did not complete. Try attaching the file again.',
      })
    }

    const { error } = await supabase
      .from('materials')
      .update({
        storage_path: input.storage_path,
        file_name: parsed.data.file_name,
        file_size: parsed.data.file_size,
        mime_type: parsed.data.mime_type,
      })
      .eq('id', material.id)

    if (error) throw error

    revalidatePath('/teacher/materials')
    revalidatePath('/student/materials')
    return { id: material.id }
  })
}

/**
 * A short-lived link to download a material's file.
 *
 * The row is read through the caller's own client first, so RLS decides whether
 * they may have it — a teacher for their own, a student for one published to
 * their class. Only then does the service role sign a URL. The bucket is
 * private and the path is unguessable, so the row is the gate.
 */
export async function getMaterialDownloadUrl(
  materialId: string,
): Promise<ActionResult<{ url: string; fileName: string }>> {
  return action(async () => {
    await requireTenant()
    const supabase = await createClient()

    const { data: material, error } = await supabase
      .from('materials')
      .select('id, storage_path, file_name')
      .eq('id', materialId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    if (!material?.storage_path) throw notFound('no file on this material')

    const { data: signed, error: signError } = await createAdminClient()
      .storage.from('learning-materials')
      .createSignedUrl(material.storage_path, 300)

    if (signError || !signed) {
      throw new AppError('STORAGE', signError?.message ?? 'could not prepare the download')
    }

    return { url: signed.signedUrl, fileName: material.file_name ?? 'material' }
  })
}

/**
 * A link for reading a material in the page, rather than downloading it.
 *
 * Same authorization as the download — the row is read through the caller's own
 * client, so RLS decides — and the same private bucket. Two things differ:
 *
 *   * No `download` option, so the object is served with an inline disposition
 *     and a browser will render it instead of saving it. With `download` set,
 *     an iframe pointed at this URL downloads a file and displays nothing.
 *   * Ten minutes rather than five, because this one has to outlive somebody
 *     actually reading the document, not just the moment they click.
 *
 * `mime_type` comes back so the caller can tell what it may embed. A PDF is
 * rendered by every browser's own viewer; a .docx is not, and offering to
 * "read" one in the page would be a button that shows nothing.
 */
export async function getMaterialViewUrl(
  materialId: string,
): Promise<ActionResult<{ url: string; fileName: string; mimeType: string | null }>> {
  return action(async () => {
    await requireTenant()
    const supabase = await createClient()

    const { data: material, error } = await supabase
      .from('materials')
      .select('id, storage_path, file_name, mime_type')
      .eq('id', materialId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    if (!material?.storage_path) throw notFound('no file on this material')

    const { data: signed, error: signError } = await createAdminClient()
      .storage.from('learning-materials')
      .createSignedUrl(material.storage_path, 600)

    if (signError || !signed) {
      throw new AppError('STORAGE', signError?.message ?? 'could not prepare the document')
    }

    return {
      url: signed.signedUrl,
      fileName: material.file_name ?? 'material',
      mimeType: material.mime_type,
    }
  })
}

export async function setMaterialPublished(input: {
  material_id: string
  publish: boolean
}): Promise<ActionResult<{ published: boolean }>> {
  return action(async () => {
    const session = await authorize({ permission: 'material.manage' })
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('materials')
      .update({
        is_published: input.publish,
        published_at: input.publish ? new Date().toISOString() : null,
      })
      .eq('id', input.material_id)
      .eq('teacher_id', session.userId)
      .select('is_published')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('material not found')

    revalidatePath('/teacher/materials')
    return { published: data.is_published }
  })
}

export async function deleteMaterial(input: {
  material_id: string
}): Promise<ActionResult<{ removed: true }>> {
  return action(async () => {
    const session = await authorize({ permission: 'material.manage' })
    const supabase = await createClient()

    // Soft delete: `deleted_at` drops it out of every listing and every student
    // policy immediately, without destroying a term's work on a misclick.
    const { data, error } = await supabase
      .from('materials')
      .update({ deleted_at: new Date().toISOString(), is_published: false })
      .eq('id', input.material_id)
      .eq('teacher_id', session.userId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('material not found')

    revalidatePath('/teacher/materials')
    return { removed: true as const }
  })
}
