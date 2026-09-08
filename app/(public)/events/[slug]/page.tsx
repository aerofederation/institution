import { notFound } from 'next/navigation'

/**
 * Event detail.
 *
 * The route exists so links from the listing resolve once events are published
 * in Phase 21. Until the `events` table exists there is no event to resolve,
 * so every slug is a genuine 404 rather than a fabricated page.
 */
export default async function EventDetailPage() {
  notFound()
}
