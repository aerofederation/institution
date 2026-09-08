'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Download } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { startAttempt } from '@/services/learning/attempt'
import { getMaterialDownloadUrl } from '@/services/teaching/materials'

/**
 * Downloads a material.
 *
 * The row is fetched through the student's own client first, so RLS decides
 * whether they may have it, and only then is a five-minute signed URL minted.
 * The bucket is private and the object path is random, so nothing here is a
 * link anybody could guess.
 */
export function DownloadMaterialButton({
  materialId,
  fileName,
}: {
  materialId: string
  fileName: string
}) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await getMaterialDownloadUrl(materialId)
          if (!result.ok) {
            toast.error(result.message)
            return
          }
          window.open(result.data.url, '_blank', 'noopener,noreferrer')
        })
      }
    >
      <Download className="size-4" aria-hidden="true" />
      {pending ? 'Preparing…' : fileName}
    </Button>
  )
}

/**
 * Starts or resumes an attempt.
 *
 * The database decides whether one is allowed — the window, the attempt count,
 * and whether the paper was published to this student's class. An attempt
 * already in progress is resumed rather than duplicated, so a refresh does not
 * consume one of the allowed attempts.
 */
export function StartAttemptButton({
  assessmentId,
  label,
}: {
  assessmentId: string
  label: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startAttempt({ assessment_id: assessmentId })
          if (!result.ok) {
            toast.error(result.message)
            return
          }
          router.push(`/student/assessments/${result.data.attemptId}`)
        })
      }
    >
      {pending ? 'Opening…' : label}
    </Button>
  )
}
