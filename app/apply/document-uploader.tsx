'use client'

import { useRef, useState, useTransition } from 'react'

import { FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { DOCUMENT_TYPES, humaniseEnum } from '@/lib/constants/enums'
import {
  listApplicationDocuments,
  removeApplicationDocument,
  requestDocumentUpload,
  type AttachedDocument,
} from '@/services/public/application'

const MAX_BYTES = 26_214_400
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx'

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Document upload for the application.
 *
 * The file goes straight from the browser to private storage using a signed URL
 * the server mints for one specific object. Three consequences worth stating:
 *
 *   * `anon` never gets a standing write grant on the bucket — the URL is good
 *     for one path and expires;
 *   * the file never passes through the Next.js server, so a 25 MB upload does
 *     not occupy a request;
 *   * the metadata row is created before the upload, and removed again if the
 *     upload fails, so a row never points at an object that does not exist.
 *
 * The browser's reported MIME type is not trusted: the extension is mapped to
 * an allowed type, and the server re-validates both type and size before it
 * signs anything.
 */
export function DocumentUploader({
  documents,
  onChange,
}: {
  documents: AttachedDocument[]
  onChange: (documents: AttachedDocument[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [documentType, setDocumentType] = useState<string>(DOCUMENT_TYPES[0])
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()

  const refresh = () =>
    startTransition(async () => {
      const result = await listApplicationDocuments()
      if (result.ok) onChange(result.data)
    })

  const upload = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME_BY_EXTENSION[extension]

    if (!mime) {
      toast.error('That file type is not accepted. Use PDF, JPEG, PNG, WebP or Word.')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(`${file.name} is ${formatSize(file.size)} — the limit is 25 MB.`)
      return
    }

    setUploading(true)
    try {
      const ticket = await requestDocumentUpload({
        document_type: documentType,
        file_name: file.name,
        mime_type: mime,
        file_size: file.size,
      })

      if (!ticket.ok) {
        toast.error(ticket.message)
        return
      }

      const supabase = createClient()
      const { error } = await supabase.storage
        .from('institution-documents')
        .uploadToSignedUrl(ticket.data.path, ticket.data.token, file, { contentType: mime })

      if (error) {
        // The metadata row exists but the object does not — remove the row so
        // the applicant does not see a document that cannot be opened.
        await removeApplicationDocument(ticket.data.documentId)
        toast.error(`${file.name} could not be uploaded. Please try again.`)
        return
      }

      toast.success(`${file.name} attached`)
      refresh()
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = (id: string, name: string) =>
    startTransition(async () => {
      const result = await removeApplicationDocument(id)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(`${name} removed`)
      refresh()
    })

  const busy = uploading || pending

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Attach the documents that let AFI headquarters verify your institution — a registration
        certificate, accreditation or affiliation, and an authorisation letter for the
        representative. You can submit without them, but review cannot complete until they are
        provided.
      </p>

      <div className="bg-muted/30 flex flex-col gap-4 rounded-lg border border-dashed p-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="document_type">Document type</Label>
          <select
            id="document_type"
            value={documentType}
            onChange={(event) => setDocumentType(event.target.value)}
            className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none sm:max-w-sm"
          >
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {humaniseEnum(type)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            id="document_file"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="size-4" aria-hidden="true" />
                Choose a file
              </>
            )}
          </Button>
          <span className="text-muted-foreground text-xs">
            PDF, JPEG, PNG, WebP or Word · up to 25 MB
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-heading text-sm font-semibold">
          Attached documents ({documents.length})
        </h3>

        {documents.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
            No documents attached yet.
          </p>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center gap-3 p-4">
                <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{document.file_name}</span>
                  <span className="text-muted-foreground text-xs">
                    {humaniseEnum(document.document_type)} · {formatSize(document.file_size)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={() => remove(document.id, document.file_name)}
                  aria-label={`Remove ${document.file_name}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
