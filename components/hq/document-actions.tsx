'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Check, ExternalLink, MoreHorizontal, X } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { reviewDocument } from '@/services/hq/applications'
import { getDocumentUrl } from '@/services/hq/storage'

/**
 * Open, verify or reject a document.
 *
 * "Open" asks the server for a signed URL at the moment of the click rather
 * than embedding one in the page. A link rendered at page-load would still be
 * valid in the HTML source after the reviewer navigated away, and would be
 * shared by anyone who copied the page.
 */
export function DocumentActions({
  documentId,
  fileName,
  status,
}: {
  documentId: string
  fileName: string
  status: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const open = () =>
    startTransition(async () => {
      const result = await getDocumentUrl(documentId)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      // noopener/noreferrer: the signed URL must not leak through the referrer.
      window.open(result.data.url, '_blank', 'noopener,noreferrer')
    })

  const verify = () =>
    startTransition(async () => {
      const result = await reviewDocument({
        document_id: documentId,
        verification_status: 'VERIFIED',
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(`${fileName} marked verified`)
      router.refresh()
    })

  const reject = () =>
    startTransition(async () => {
      const result = await reviewDocument({
        document_id: documentId,
        verification_status: 'REJECTED',
        rejection_reason: reason.trim(),
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(`${fileName} marked rejected`)
      setRejecting(false)
      setReason('')
      router.refresh()
    })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={pending} aria-label={`Actions for ${fileName}`}>
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={(event) => { event.preventDefault(); open() }}>
            <ExternalLink className="size-4" aria-hidden="true" />
            Open document
          </DropdownMenuItem>
          {status !== 'VERIFIED' ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={(event) => { event.preventDefault(); verify() }}>
                <Check className="size-4" aria-hidden="true" />
                Mark verified
              </DropdownMenuItem>
            </>
          ) : null}
          {status !== 'REJECTED' ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={(event) => {
                event.preventDefault()
                setRejecting(true)
              }}
            >
              <X className="size-4" aria-hidden="true" />
              Mark rejected
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={rejecting} onOpenChange={(next) => !pending && setRejecting(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this document?</AlertDialogTitle>
            <AlertDialogDescription>
              The applicant sees the reason you give. Rejecting a document does not by itself
              change the application&rsquo;s status.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="document-rejection">
              Reason
              <span className="text-destructive ml-1" aria-hidden="true">*</span>
            </Label>
            <Textarea
              id="document-rejection"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The certificate is expired and cannot be used for verification."
              rows={3}
              aria-required
              aria-invalid={reason.trim().length === 0}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                reject()
              }}
              disabled={pending || reason.trim().length === 0}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? 'Working…' : 'Reject document'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
