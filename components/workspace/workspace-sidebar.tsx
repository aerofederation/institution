'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { ShieldCheck } from 'lucide-react'

import { AfiMark } from '@/components/brand/afi-logo'
import { InstitutionAccountMenu } from '@/components/institution/institution-account-menu'
import { WORKSPACE_NAVS, type WorkspaceKey } from '@/components/workspace/nav-registry'
import { isActiveRoute } from '@/components/workspace/workspace-nav'
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
import type { PermissionCode } from '@/lib/permissions/definitions'

/**
 * The sidebar every tenant workspace uses.
 *
 * Not forced dark, unlike HQ. HQ reads as a control room because it oversees
 * the federation; these are places people do daily work.
 */
export function WorkspaceSidebar({
  navKey,
  homeHref,
  title,
  subtitle,
  permissions,
  fullName,
  email,
  roleLabel,
}: {
  navKey: WorkspaceKey
  homeHref: string
  title: string
  subtitle: string
  /** Serialisable permission list from the server session. */
  permissions: PermissionCode[]
  fullName: string
  email: string
  roleLabel: string
}) {
  const pathname = usePathname()
  const held = new Set(permissions)
  const nav = WORKSPACE_NAVS[navKey]

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="border-sidebar-border border-b">
        <Link
          href={homeHref}
          className="flex items-center gap-2.5 px-1 py-1.5"
          aria-label={`${title} — ${subtitle}`}
        >
          <AfiMark className="size-7 shrink-0" />
          <span className="flex min-w-0 flex-col leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-heading truncate text-sm font-bold tracking-tight">{title}</span>
            <span className="text-sidebar-foreground/50 mt-1 font-mono text-[9px] tracking-[0.16em] uppercase">
              {subtitle}
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {nav.map((group) => {
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
          <span className="truncate">Tenant-isolated · RLS enforced</span>
        </div>
        <InstitutionAccountMenu fullName={fullName} email={email} roleLabel={roleLabel} />
      </SidebarFooter>
    </Sidebar>
  )
}
