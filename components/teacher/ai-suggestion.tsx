'use client'

import { useState, useTransition } from 'react'

import { Check, Sparkles, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { suggestMark, type SuggestionResult } from '@/services/ai/grading'

/**
 * A drafted mark, for the teacher to accept or ignore.
 *
 * Everything here is presentation of something the model said. Pressing "Use
 * this mark" fills in the marks box — it does not submit the form. The teacher
 * still presses their own button, which calls the same grading path that runs
 * when no model is involved. There is no code path from this component to
 * `assessment_answers`.
 *
 * The rationale is shown in full, above the number. A teacher deciding whether
 * to agree needs the reasoning first; a figure with the argument folded away
 * invites agreement without reading.
 */
export function AiSuggestion({
  answerId,
  assessmentId,
  maxMarks,
  hasRubric,
  onUse,
}: {
  answerId: string
  assessmentId: string
  maxMarks: number
  hasRubric: boolean
  /** Fills the marks input. Deliberately does not submit. */
  onUse: (marks: number) => void
}) {
  const [pending, startTransition] = useTransition()
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const request = () =>
    startTransition(async () => {
      const result = await suggestMark({ answer_id: answerId, assessment_id: assessmentId })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      setSuggestion(result.data)
      setDismissed(false)
    })

  if (!hasRubric) {
    return (
      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Add a rubric to this question and the assistant can draft a mark against it.
      </p>
    )
  }

  if (!suggestion || dismissed) {
    return (
      <Button variant="outline" size="sm" onClick={request} disabled={pending} className="w-fit">
        <Sparkles className="size-4" aria-hidden="true" />
        {pending ? 'Reading the answer…' : 'Draft a mark with AI'}
      </Button>
    )
  }

  const confidenceTone =
    suggestion.confidence === 'HIGH'
      ? 'border-success/40 text-success'
      : suggestion.confidence === 'MEDIUM'
        ? 'border-warning/50 text-warning'
        : 'border-destructive/40 text-destructive'

  return (
    <div className="border-primary/30 bg-primary/5 flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="text-primary size-4 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">Suggested by {suggestion.model}</span>

        <span className={cn('rounded-full border px-2 py-0.5 text-[11px]', confidenceTone)}>
          {suggestion.confidence.charAt(0) + suggestion.confidence.slice(1).toLowerCase()} confidence
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss this suggestion"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <p className="text-sm">{suggestion.rationale}</p>

      {suggestion.pointsMet.length > 0 || suggestion.pointsMissed.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs">
          {suggestion.pointsMet.map((point) => (
            <li key={`met-${point}`} className="flex items-start gap-1.5">
              <Check className="text-success mt-0.5 size-3.5 shrink-0" aria-label="Met" />
              <span>{point}</span>
            </li>
          ))}
          {suggestion.pointsMissed.map((point) => (
            <li key={`missed-${point}`} className="text-muted-foreground flex items-start gap-1.5">
              <X className="mt-0.5 size-3.5 shrink-0" aria-label="Not met" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {suggestion.clamped ? (
        <p className="text-destructive flex items-start gap-1.5 text-xs">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          The model proposed a mark outside this question’s range, so it was clamped. Treat this
          suggestion with more than the usual suspicion.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        <Button
          size="sm"
          onClick={() => {
            onUse(suggestion.suggestedMarks)
            toast.info('Filled in — check it, then save the mark yourself')
          }}
        >
          Use {suggestion.suggestedMarks} / {maxMarks}
        </Button>

        <Button variant="outline" size="sm" onClick={request} disabled={pending}>
          {pending ? 'Re-reading…' : 'Ask again'}
        </Button>

        {/*
          Stated on the surface, not just in the code. A teacher should never be
          in any doubt about who is awarding the mark.
        */}
        <span className="text-muted-foreground text-xs">
          Nothing is recorded until you save the mark.
        </span>
      </div>
    </div>
  )
}
