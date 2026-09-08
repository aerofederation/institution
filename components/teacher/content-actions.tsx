'use client'

import { useRef, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Download, Eye, EyeOff, MoreHorizontal, Trash2, Upload } from 'lucide-react'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import {
  attachMaterialFile,
  deleteMaterial,
  getMaterialDownloadUrl,
  requestMaterialUpload,
  setMaterialPublished,
} from '@/services/teaching/materials'

/**
 * Publish, unpublish, attach a file, delete.
 *
 * Unpublishing is offered as freely as publishing: a teacher who spots a
 * mistake in front of a class needs to take it down in one action, and
 * `is_published` is what every student policy checks, so it disappears
 * immediately rather than at the next revalidation.
 */
export function MaterialActions({
  materialId,
  title,
  published,
  hasFile,
  isDocument,
}: {
  materialId: string
  title: string
  published: boolean
  hasFile: boolean
  isDocument: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const togglePublished = () =>
    startTransition(async () => {
      const result = await setMaterialPublished({ material_id: materialId, publish: !published })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(result.data.published ? 'Published to the class' : 'Taken down')
      router.refresh()
    })

  const remove = () =>
    startTransition(async () => {
      const result = await deleteMaterial({ material_id: materialId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(`${title} deleted`)
      setConfirming(false)
      router.refresh()
    })

  const download = () =>
    startTransition(async () => {
      const result = await getMaterialDownloadUrl(materialId)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer')
    })

  /*
   * The upload is two steps: the server mints a signed URL for one object under
   * this institution's prefix, and the browser sends the bytes straight to
   * storage. The file never passes through the application server, and the
   * browser never holds a standing write grant on the bucket.
   */
  const upload = (file: File) =>
    startTransition(async () => {
      const ticket = await requestMaterialUpload({
        material_id: materialId,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
      })

      if (!ticket.ok) {
        toast.error(ticket.message)
        return
      }

      const { error } = await createClient()
        .storage.from('learning-materials')
        .uploadToSignedUrl(ticket.data.path, ticket.data.token, file)

      if (error) {
        toast.error(`Upload failed: ${error.message}`)
        return
      }

      // Only now is the file recorded on the row. The ticket used to write it
      // up front, which meant a failed upload left a material offering a
      // download that did not exist.
      const attached = await attachMaterialFile({
        material_id: materialId,
        storage_path: ticket.data.path,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
      })

      if (!attached.ok) {
        toast.error(attached.message)
        return
      }

      toast.success(`${file.name} attached`)
      router.refresh()
    })

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) upload(file)
          event.target.value = ''
        }}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${title}`}>
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {isDocument ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                fileInput.current?.click()
              }}
              disabled={pending}
            >
              <Upload className="size-4" aria-hidden="true" />
              {hasFile ? 'Replace file' : 'Attach file'}
            </DropdownMenuItem>
          ) : null}

          {hasFile ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                download()
              }}
              disabled={pending}
            >
              <Download className="size-4" aria-hidden="true" />
              Download
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              togglePublished()
            }}
            disabled={pending || (isDocument && !hasFile && !published)}
          >
            {published ? (
              <>
                <EyeOff className="size-4" aria-hidden="true" />
                Take down
              </>
            ) : (
              <>
                <Eye className="size-4" aria-hidden="true" />
                Publish
              </>
            )}
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              setConfirming(true)
            }}
            disabled={pending}
            variant="destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={(next) => !pending && setConfirming(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from your students&apos; view immediately. This cannot be undone from
              here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                remove()
              }}
              disabled={pending}
            >
              {pending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
