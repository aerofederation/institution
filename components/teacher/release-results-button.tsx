'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { releaseResults } from '@/services/assessments/grading'

/**
 * Releases results to the class.
 *
 * Only meaningful under the MANUAL policy — the other three release themselves
 * when their condition is met — so the button says which policy is in force
 * rather than appearing to do nothing.
 *
 * `teacher_release_results()` releases only attempts with no outstanding manual
 * marking, so pressing this early cannot publish a half-marked score.
 */
export function ReleaseResultsButton({
  assessmentId,
  policy,
  alreadyReleased,
}: {
  assessmentId: string
  policy: string
  alreadyReleased: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      const result = await releaseResults({ assessment_id: assessmentId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(
        result.data.released > 0
          ? `Released ${result.data.released} result${result.data.released === 1 ? '' : 's'}`
          : 'Nothing to release — every finished paper still has marking outstanding',
      )
      router.refresh()
    })

  if (policy !== 'MANUAL') {
    return (
      <span className="text-muted-foreground text-xs">
        Results release {policy === 'IMMEDIATE' ? 'as soon as marking finishes' : policy === 'AFTER_GRADING' ? 'once everything is marked' : 'after the paper closes'}
      </span>
    )
  }

  return (
    <Button size="sm" onClick={submit} disabled={pending}>
      <Send className="size-4" aria-hidden="true" />
      {pending ? 'Releasing…' : alreadyReleased ? 'Release again' : 'Release results'}
    </Button>
  )
}
