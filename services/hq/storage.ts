'use server'

import { requireHq } from '@/lib/auth/hq'
import { action, notFound, type ActionResult } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

/**
 * Mints a short-lived signed URL for a private document.
 *
 * Every bucket on this platform is private, so there is no URL that simply
 * works. The order here is the point:
 *
 *   1. Authorise the caller for `document.read_all`.
 *   2. Read the metadata row — which is itself subject to RLS, so a document
 *      the caller may not see does not resolve at all.
 *   3. Only then ask Storage for a signed link, valid for 60 seconds.
 *
 * `storage_path` is never sent to the browser and never rendered into a page.
 * The link that is returned expires, is tied to one object, and grants nothing
 * else in the bucket.
 */
export async function getDocumentUrl(documentId: string): Promise<ActionResult<{ url: string }>> {
  return action(async () => {
    await requireHq('document.read_all')
    const supabase = await createClient()

    const { data: document, error } = await supabase
      .from('institution_documents')
      .select('id, storage_path, file_name')
      .eq('id', documentId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw error
    if (!document) throw notFound('document not found')

    const { data: signed, error: signError } = await supabase.storage
      .from('institution-documents')
      .createSignedUrl(document.storage_path, 60, { download: false })

    if (signError || !signed?.signedUrl) {
      throw new Error(signError?.message ?? 'could not sign the document URL')
    }

    await supabase.rpc('write_audit_log', {
      action: 'DOCUMENT_VIEWED',
      entity_type: 'institution_document',
      entity_id: document.id,
      metadata: {} as never,
    })

    return { url: signed.signedUrl }
  })
}
