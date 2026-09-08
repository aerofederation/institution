'use client'

import { useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { ChevronsUpDown, LogOut, Settings, ShieldCheck } from 'lucide-react'

import { signOut } from '@/app/(auth)/actions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function HqAccountMenu({ fullName, email }: { fullName: string; email: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const signOutNow = () =>
    startTransition(async () => {
      const result = await signOut()
      // Even a failed sign-out must not strand the user inside HQ chrome.
      router.replace(result.ok ? result.data.redirectTo : '/hq/login')
      router.refresh()
    })

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent"
              aria-label="Account menu"
            >
              <Avatar className="size-7 rounded-md">
                <AvatarFallback className="bg-primary/15 text-primary rounded-md text-[11px] font-semibold">
                  {initialsOf(fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-medium">{fullName}</span>
                <span className="text-sidebar-foreground/55 truncate font-mono text-[10px] tracking-wide uppercase">
                  HQ Admin
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0" aria-hidden="true" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="top"
            align="start"
            className="w-60"
            sideOffset={8}
          >
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{fullName}</span>
              <span className="text-muted-foreground truncate text-xs font-normal">{email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/hq/settings">
                <Settings className="size-4" aria-hidden="true" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/hq/settings#security">
                <ShieldCheck className="size-4" aria-hidden="true" />
                Security
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                signOutNow()
              }}
              disabled={pending}
              variant="destructive"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {pending ? 'Signing out…' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
