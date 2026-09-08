'use client'

import { useEffect, useState } from 'react'

import { AlertTriangle, Loader2, Maximize2, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Reads a PDF inside the page.
 *
 * The browser's own PDF viewer does the work, in an iframe. That is a
 * deliberate choice over shipping pdf.js: every browser already has a viewer
 * with scrolling, zoom, page jumping, text selection, search and printing, it
 * is keyboard accessible and it renders text as text rather than as a canvas
 * bitmap. A bundled renderer would be several hundred kilobytes to arrive at
 * something worse.
 *
 * The URL is signed and short-lived, and the bucket behind it is private. It is
 * fetched when the component mounts rather than embedded in the server-rendered
 * HTML, so a link that outlives the reading session is not sitting in the page
 * source.
 *
 * Worth being plain about: this is a reading surface, not a restriction. Any
 * viewer has to send the file to the browser to display it, so the bytes are on
 * the reader's machine either way and the toolbar's own save button will keep
 * working. If a document genuinely must not leave the institution, that is a
 * question about what gets uploaded, not about this component.
 */
export function PdfReader({
  load,
  fileName,
}: {
  /** Fetches a fresh signed URL. Called on mount, and again on Reload. */
  load: () => Promise<{ ok: true; data: { url: string } } | { ok: false; message: string }>
  fileName: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setUrl(null)
      setFailure(null)

      const result = await load()
      if (cancelled) return

      if (!result.ok) {
        setFailure(result.message)
        return
      }
      setUrl(result.data.url)
    })()

    return () => {
      cancelled = true
    }
    // `load` is a server action reference and stable; `attempt` is the retry.
  }, [load, attempt])

  if (failure) {
    return (
      <div className="bg-card flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-lg border p-8 text-center">
        <AlertTriangle className="text-warning size-6" aria-hidden="true" />
        <p className="text-sm font-medium">This document could not be opened</p>
        <p className="text-muted-foreground max-w-md text-sm">{failure}</p>
        <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          <RotateCw className="size-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    )
  }

  if (!url) {
    return (
      <div className="bg-card text-muted-foreground flex min-h-[60vh] items-center justify-center gap-2 rounded-lg border text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Opening {fileName}…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="bg-card overflow-hidden rounded-lg border">
        {/*
          `min-h` rather than a fixed height, and tall: a reader wants the page
          filled. The viewer scrolls inside the frame, so the page around it
          stays put instead of the document and the layout scrolling together.
        */}
        <iframe
          key={url}
          src={url}
          title={fileName}
          className="h-[80vh] min-h-[32rem] w-full border-0"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          A signed link expires. Reloading mints a fresh one rather than leaving
          somebody looking at a frame that stopped working while they read.
        */}
        <Button variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          <RotateCw className="size-4" aria-hidden="true" />
          Reload
        </Button>

        <Button variant="ghost" size="sm" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Maximize2 className="size-4" aria-hidden="true" />
            Open full screen
          </a>
        </Button>

        <p className="text-muted-foreground text-xs">
          Scroll inside the document to read. Your browser’s viewer handles zoom and search.
        </p>
      </div>
    </div>
  )
}
