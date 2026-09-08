import { Bell } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { NotificationList } from '@/components/student/notification-list'
import { listNotifications } from '@/services/notifications'

export const metadata = { title: 'Notifications' }

/**
 * Everything addressed to this student.
 *
 * `notifications` is owner-scoped by RLS — its only SELECT policy is
 * `user_id = auth.uid()` — so this page shows the signed-in student's own
 * notices and nothing else, whatever the query asks for.
 */
export default async function StudentNotificationsPage() {
  const notifications = await listNotifications()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Learning"
        title="Notifications"
        description="Work your teachers have set, and notices about your account."
        breadcrumbs={[{ label: 'Learning', href: '/student' }, { label: 'Notifications' }]}
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="When a teacher publishes an assignment, quiz or test to your class, you are told here."
        />
      ) : (
        <NotificationList notifications={notifications} />
      )}
    </div>
  )
}
