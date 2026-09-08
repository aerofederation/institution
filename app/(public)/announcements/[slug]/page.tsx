import { notFound } from 'next/navigation'

/**
 * Announcement detail.
 *
 * Routed ahead of the `announcements` table landing in Phase 21. With no
 * announcements to resolve, every slug is a real 404.
 */
export default async function AnnouncementDetailPage() {
  notFound()
}
