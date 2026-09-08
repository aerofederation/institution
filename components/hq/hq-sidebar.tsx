'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { ShieldCheck } from 'lucide-react'

import { AfiMark } from '@/components/brand/afi-logo'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { HQ_NAV, isActiveRoute } from '@/components/hq/hq-nav'
import { HqAccountMenu } from '@/components/hq/hq-account-menu'
import type { PermissionCode } from '@/lib/permissions/definitions'

export function HqSidebar({
  permissions,
  fullName,
  email,
}: {
  /** Serialisable permission list from the server session. */
  permissions: PermissionCode[]
  fullName: string
  email: string
}) {
  const pathname = usePathname()

  const held = new Set(permissions)

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="border-sidebar-border border-b">
        <Link
          href="/hq"
          className="flex items-center gap-3 px-1 py-1.5"
          aria-label="AEROFEDERATION HEAD QUARTERS Command Centre"
        >
          <AfiMark className="size-8 shrink-0" />
          <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-heading text-xs font-bold tracking-tight text-sidebar-foreground uppercase leading-[1.2]">
              AEROFEDERATION
            </span>
            <span className="font-heading text-xs font-bold tracking-tight text-sidebar-foreground uppercase leading-[1.2]">
              HEAD QUARTERS
            </span>
            <span className="text-sidebar-foreground/50 mt-0.5 font-mono text-[9px] tracking-[0.16em] uppercase leading-none">
              Command Centre
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {HQ_NAV.map((group) => {
          const visible = group.items.filter(
            (item) => !item.permission || held.has(item.permission),
          )
          if (!visible.length) return null

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="font-mono text-[10px] tracking-[0.14em] uppercase">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const active = isActiveRoute(pathname, item)
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          aria-current={active ? 'page' : undefined}
                        >
                          <Link href={item.href}>
                            <item.icon aria-hidden="true" />
                            <span className="truncate">{item.label}</span>
                            {item.status === 'pending' ? (
                              <span
                                className="border-sidebar-border text-sidebar-foreground/45 ml-auto rounded border px-1 py-px font-mono text-[9px] tracking-wide uppercase group-data-[collapsible=icon]:hidden"
                                title="Backing data arrives in a later phase"
                              >
                                Soon
                              </span>
                            ) : null}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border gap-2 border-t">
        <div className="text-sidebar-foreground/55 flex items-center gap-2 px-2 py-1 text-[11px] group-data-[collapsible=icon]:hidden">
          <ShieldCheck className="text-success size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Session secured · RLS enforced</span>
        </div>
        <HqAccountMenu fullName={fullName} email={email} />
      </SidebarFooter>
    </Sidebar>
  )
}
