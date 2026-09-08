'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import {
  Building2,
  FileCheck2,
  FileText,
  GraduationCap,
  Loader2,
  Search,
  Users,
} from 'lucide-react'

import { searchFederation, type SearchHit } from '@/app/hq/(command)/search-action'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

const ICONS = {
  institution: Building2,
  application: FileCheck2,
  teacher: Users,
  student: GraduationCap,
  document: FileText,
} as const

const GROUP_LABEL: Record<SearchHit['kind'], string> = {
  institution: 'Institutions',
  application: 'Applications',
  teacher: 'Teachers',
  student: 'Students',
  document: 'Documents',
}

/**
 * Federation-wide search.
 *
 * The query runs in a Server Action against PostgREST, so results are produced
 * by the database under the caller's RLS context. Nothing is pre-loaded into
 * the browser to be filtered locally — a command palette that shipped the
 * federation's directory to the client in order to search it would be both slow
 * and a disclosure.
 */
export function HqCommandSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const trimmed = term.trim()
  const searchable = trimmed.length >= 2

  useEffect(() => {
    if (!searchable) return
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchFederation(trimmed)
        setHits(result.ok ? result.data : [])
      })
    }, 220)
    return () => clearTimeout(timer)
  }, [trimmed, searchable])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      setTerm('')
      router.push(href)
    },
    [router],
  )

  // Derived, not stored: when the query drops below the threshold the old
  // results simply stop being shown, rather than being cleared from an effect.
  const visible = searchable ? hits : []

  const grouped = visible.reduce<Record<string, SearchHit[]>>((accumulator, hit) => {
    ;(accumulator[hit.kind] ??= []).push(hit)
    return accumulator
  }, {})

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'border-input bg-background/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          'flex h-9 w-full items-center gap-2 rounded-md border px-3 text-sm transition-colors sm:w-72 lg:w-96',
        )}
        aria-label="Search the federation"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Search institutions, people, applications…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Federation search"
        description="Search institutions, applications, teachers, students and documents"
        shouldFilter={false}
      >
        <CommandInput
          placeholder="Search institutions, applications, people, documents…"
          value={term}
          onValueChange={setTerm}
        />
        <CommandList>
          {pending ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Searching…
            </div>
          ) : null}

          {!pending && searchable && visible.length === 0 ? (
            <CommandEmpty>No matches for “{trimmed}”.</CommandEmpty>
          ) : null}

          {!pending && !searchable ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Type at least two characters to search across the federation.
            </p>
          ) : null}

          {Object.entries(grouped).map(([kind, group]) => {
            const Icon = ICONS[kind as SearchHit['kind']]
            return (
              <CommandGroup key={kind} heading={GROUP_LABEL[kind as SearchHit['kind']]}>
                {group.map((hit) => (
                  <CommandItem
                    key={`${hit.kind}-${hit.id}`}
                    value={`${hit.kind}-${hit.id}`}
                    onSelect={() => go(hit.href)}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{hit.title}</span>
                    {hit.subtitle ? (
                      <span className="ml-auto truncate text-xs text-muted-foreground">
                        {hit.subtitle}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
        </CommandList>
      </CommandDialog>
    </>
  )
}
