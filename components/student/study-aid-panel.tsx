'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Download, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { generateStudyAid, type StudyAid } from '@/services/ai/study-aid'

/**
 * The study aid for one material.
 *
 * Answers are hidden behind a press rather than shown inline. A student who can
 * see the answer while reading the question has not tested themselves on
 * anything, and this is the only part of the feature that decides whether it is
 * revision or just more reading.
 */

const SOURCE_LABEL: Record<StudyAid['source_kind'], string> = {
  PDF: 'Built from the document itself.',
  IMAGE: 'Built from the image itself.',
  NOTE: 'Built from your teacher’s written note.',
  DESCRIPTION:
    'Built from the title and description only — the file itself could not be read, so this covers less than the material does.',
}

const DIFFICULTY_STYLE: Record<StudyAid['questions'][number]['difficulty'], string> = {
  EASY: 'border-success/40 text-success',
  MODERATE: 'border-warning/40 text-warning',
  HARD: 'border-destructive/40 text-destructive',
}

export function StudyAidPanel({
  materialId,
  materialTitle,
  aid,
}: {
  materialId: string
  materialTitle: string
  aid: StudyAid | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const generate = () =>
    startTransition(async () => {
      const result = await generateStudyAid({ material_id: materialId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Study aid ready')
      router.refresh()
    })

  if (!aid) {
    return (
      <div className="bg-card flex flex-col items-start gap-3 rounded-lg border p-5">
        <span className="flex items-center gap-2 font-medium">
          <Sparkles className="text-primary size-4" aria-hidden="true" />
          Study aid
        </span>
        <p className="text-muted-foreground text-sm">
          Get a summary, the key points, and practice questions built from this material. It is made
          once and shared with your class, so if a classmate has already asked for it, you will see
          theirs.
        </p>
        <Button onClick={generate} disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Reading the material…
            </>
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden="true" />
              Create study aid
            </>
          )}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 font-medium">
          <Sparkles className="text-primary size-4" aria-hidden="true" />
          Study aid
        </span>
        <DownloadPdfButton aid={aid} materialTitle={materialTitle} />
      </div>

      {/*
        Said plainly, not buried in a footnote. A student revising the night
        before an exam should know whether this was built from the document or
        from one line of description.
      */}
      <p className="text-muted-foreground border-l-2 pl-3 text-xs">
        Written by AI from your teacher’s material. {SOURCE_LABEL[aid.source_kind]} Check anything
        that matters against the material itself.
      </p>

      <section className="bg-card flex flex-col gap-2 rounded-lg border p-5">
        <h2 className="font-heading text-base font-semibold">Summary</h2>
        <p className="text-sm whitespace-pre-wrap">{aid.summary}</p>
      </section>

      {aid.key_points.length > 0 ? (
        <section className="bg-card flex flex-col gap-3 rounded-lg border p-5">
          <h2 className="font-heading text-base font-semibold">Key points</h2>
          <ul className="flex flex-col gap-2">
            {aid.key_points.map((point, index) => (
              <li key={index} className="flex gap-2.5 text-sm">
                <span className="bg-primary/10 text-primary mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold">
                  {index + 1}
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {aid.questions.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-semibold">
            Practice questions
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              {aid.questions.length} to try
            </span>
          </h2>

          <ul className="flex flex-col gap-3">
            {aid.questions.map((item, index) => (
              <PracticeQuestion key={index} item={item} position={index + 1} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function PracticeQuestion({
  item,
  position,
}: {
  item: StudyAid['questions'][number]
  position: number
}) {
  const [shown, setShown] = useState(false)

  return (
    <li className="bg-card flex flex-col gap-3 rounded-lg border p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold">
          {position}
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium">{item.question}</p>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[10px] tracking-wide uppercase',
            DIFFICULTY_STYLE[item.difficulty],
          )}
        >
          {item.difficulty.toLowerCase()}
        </span>
      </div>

      {shown ? (
        <p className="bg-muted/50 rounded-md border p-3 text-sm whitespace-pre-wrap">
          {item.answer}
        </p>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setShown((value) => !value)}
        aria-expanded={shown}
      >
        {shown ? (
          <>
            <EyeOff className="size-4" aria-hidden="true" />
            Hide answer
          </>
        ) : (
          <>
            <Eye className="size-4" aria-hidden="true" />
            Show answer
          </>
        )}
      </Button>
    </li>
  )
}

/**
 * A real PDF, built in the browser.
 *
 * Generated client-side rather than on the server because the content is
 * already on this page — sending it back to be rendered would be a round trip
 * for nothing, and the file never has to exist in storage. `jspdf` is loaded on
 * click rather than imported at the top, so the library is not in the bundle
 * for the many students who never press it.
 */
function DownloadPdfButton({ aid, materialTitle }: { aid: StudyAid; materialTitle: string }) {
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })

      const margin = 56
      const width = doc.internal.pageSize.getWidth() - margin * 2
      const bottom = doc.internal.pageSize.getHeight() - margin
      let y = margin

      const flow = (text: string, size: number, style: 'normal' | 'bold', gap = 6) => {
        doc.setFont('helvetica', style)
        doc.setFontSize(size)

        for (const line of doc.splitTextToSize(text, width)) {
          // A new page before the line is drawn, not after — otherwise the last
          // line of every page lands in the margin.
          if (y > bottom) {
            doc.addPage()
            y = margin
          }
          doc.text(line, margin, y)
          y += size + 3
        }
        y += gap
      }

      flow(materialTitle, 18, 'bold', 4)
      flow(
        `Study aid · written by AI from your teacher's material · ${new Date(
          aid.created_at,
        ).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
        9,
        'normal',
        14,
      )

      flow('Summary', 13, 'bold', 4)
      flow(aid.summary, 11, 'normal', 14)

      if (aid.key_points.length > 0) {
        flow('Key points', 13, 'bold', 4)
        aid.key_points.forEach((point, index) => flow(`${index + 1}. ${point}`, 11, 'normal', 2))
        y += 12
      }

      if (aid.questions.length > 0) {
        flow('Practice questions', 13, 'bold', 6)
        aid.questions.forEach((item, index) => {
          flow(`${index + 1}. ${item.question}  [${item.difficulty.toLowerCase()}]`, 11, 'bold', 2)
          flow(`Answer: ${item.answer}`, 11, 'normal', 10)
        })
      }

      const safe = materialTitle.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
      doc.save(`${safe || 'study-aid'}-study-aid.pdf`)
    } catch (error) {
      toast.error(`Could not build the PDF: ${(error as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void download()} disabled={busy}>
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="size-4" aria-hidden="true" />
      )}
      Download as PDF
    </Button>
  )
}
