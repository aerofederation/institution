'use client'

import { useEffect, useState, useTransition } from 'react'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { ImageIcon, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  getQuestionMediaUrl,
  requestQuestionMediaUpload,
  setQuestionMedia,
} from '@/services/assessments/builder'

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_BYTES = 5 * 1024 * 1024

/**
 * A private image, rendered.
 *
 * `unoptimized` is deliberate, not laziness. The optimizer would fetch this
 * object server-side and re-serve it from a stable, cacheable `/_next/image`
 * URL — turning a short-lived signed link to a private object into a durable
 * public one. The width and height are layout hints only; `h-auto w-auto` lets
 * the browser keep the real aspect ratio.
 */
function PrivateImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={1200}
      height={900}
      unoptimized
      className={className}
      style={{ height: 'auto', width: 'auto' }}
    />
  )
}

/**
 * Fetches a question's image as a signed URL.
 *
 * `null` until it arrives, and `null` again whenever the question has no image
 * — derived from `hasMedia` at render rather than cleared inside the effect, so
 * nothing sets state during a render pass.
 */
function useQuestionMedia(questionId: string, hasMedia: boolean) {
  const [fetched, setFetched] = useState<{ id: string; url: string | null } | null>(null)

  useEffect(() => {
    if (!hasMedia) return

    let cancelled = false
    void getQuestionMediaUrl(questionId).then((result) => {
      if (!cancelled && result.ok) setFetched({ id: questionId, url: result.data.url })
    })

    return () => {
      cancelled = true
    }
  }, [questionId, hasMedia])

  // Guarding on the id as well means a stale URL from a previous question can
  // never be shown against a different one.
  return hasMedia && fetched?.id === questionId ? fetched.url : null
}

/**
 * Attaching a diagram to a question.
 *
 * Three steps, and the browser only does the middle one: the server signs a URL
 * for exactly one path, the browser PUTs the bytes, and the server records the
 * path after re-checking who owns the paper and that the path sits inside the
 * institution's own prefix.
 */
export function QuestionMedia({
  questionId,
  assessmentId,
  hasMedia,
  editable,
}: {
  questionId: string
  assessmentId: string
  hasMedia: boolean
  editable: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const url = useQuestionMedia(questionId, hasMedia)

  const upload = async (file: File) => {
    // Checked here so an obvious mistake is caught before the bytes travel; the
    // server checks the path and ownership again, which is what counts.
    if (!ACCEPTED.includes(file.type)) {
      toast.error('Images only — PNG, JPEG, WebP or GIF.')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Images must be 5 MB or smaller.')
      return
    }

    setUploading(true)

    try {
      const ticket = await requestQuestionMediaUpload({
        question_id: questionId,
        file_name: file.name,
      })
      if (!ticket.ok) {
        toast.error(ticket.message)
        return
      }

      const put = await fetch(ticket.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type },
      })
      if (!put.ok) {
        toast.error('The upload did not complete.')
        return
      }

      const saved = await setQuestionMedia({
        question_id: questionId,
        assessment_id: assessmentId,
        path: ticket.data.path,
        mime_type: file.type,
      })
      if (!saved.ok) {
        toast.error(saved.message)
        return
      }

      toast.success('Image attached')
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  const clear = () =>
    startTransition(async () => {
      const result = await setQuestionMedia({
        question_id: questionId,
        assessment_id: assessmentId,
        path: null,
        mime_type: null,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Image removed')
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-2 pl-9">
      {url ? (
        <PrivateImage
          src={url}
          alt="Attached to this question"
          className="max-h-64 rounded-md border object-contain"
        />
      ) : hasMedia ? (
        <p className="text-muted-foreground text-xs">Loading image…</p>
      ) : null}

      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex">
            <span className="sr-only">Attach an image to this question</span>
            <input
              type="file"
              accept={ACCEPTED.join(',')}
              disabled={uploading || pending}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
              }}
              className="file:bg-muted file:text-foreground text-muted-foreground max-w-xs text-xs file:mr-2 file:rounded file:border-0 file:px-2 file:py-1 file:text-xs"
            />
          </label>

          {uploading ? <span className="text-muted-foreground text-xs">Uploading…</span> : null}

          {hasMedia ? (
            <Button variant="ghost" size="sm" onClick={clear} disabled={pending}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              Remove
            </Button>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <ImageIcon className="size-3.5" aria-hidden="true" />
              Optional diagram, up to 5 MB
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The diagram as a student sees it while sitting the paper.
 *
 * `assessment_question_media()` hands back a path only to the owning teacher or
 * to a student holding a live attempt that was actually served this question,
 * so opening the image is not a way around the paper.
 */
export function QuestionImage({ questionId }: { questionId: string }) {
  const url = useQuestionMedia(questionId, true)
  if (!url) return null

  return (
    <PrivateImage
      src={url}
      alt="Diagram for this question"
      className="max-h-80 rounded-md border object-contain"
    />
  )
}
