'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { signOut } from '@/app/(auth)/actions'

export function SignOutButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await signOut()
          router.replace(result.ok ? result.data.redirectTo : '/login')
          router.refresh()
        })
      }
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  )
}
