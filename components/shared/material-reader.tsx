'use client'

import { useCallback } from 'react'

import { PdfReader } from '@/components/shared/pdf-reader'
import { getMaterialViewUrl } from '@/services/teaching/materials'

/**
 * Binds one material to the reader.
 *
 * A server component cannot hand a closure to a client one, so the id is passed
 * as a prop and the call is made here. `getMaterialViewUrl` reads the row
 * through the caller's own client, so RLS decides whether a link is minted at
 * all — a teacher for their own material, a student for one published to their
 * class.
 */
export function MaterialReader({
  materialId,
  fileName,
}: {
  materialId: string
  fileName: string
}) {
  const load = useCallback(() => getMaterialViewUrl(materialId), [materialId])

  return <PdfReader load={load} fileName={fileName} />
}
