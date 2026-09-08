'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Loader2, Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * Filtering as URL state.
 *
 * These are the only Client Components in an otherwise server-rendered list.
 * They do not hold data or filter anything themselves — they write a query
 * parameter and let the server re-query. That keeps the whole result set on the
 * server (so RLS still decides what exists), keeps the client bundle to an
 * input and a select, and makes every filtered view a shareable URL.
 *
 * Any filter change resets `page`, because landing on page 4 of a result set
 * that now has one page is a dead end.
 */

function useQueryUpdater() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const update = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      params.delete('page')

      const query = params.toString()
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
      })
    },
    [pathname, router, searchParams],
  )

  return { update, pending, searchParams }
}

export function SearchInput({
  placeholder = 'Search…',
  paramName = 'q',
  className,
  label,
}: {
  placeholder?: string
  paramName?: string
  className?: string
  /** Accessible name. Falls back to the placeholder. */
  label?: string
}) {
  const { update, pending, searchParams } = useQueryUpdater()
  const initial = searchParams.get(paramName) ?? ''
  const [value, setValue] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /*
   * Keep in step when the URL changes from elsewhere — a cleared filter chip, a
   * breadcrumb, the back button.
   *
   * Adjusted during render rather than in an effect. Mirroring a prop into
   * state with `useEffect` renders once with the stale value and then again
   * with the corrected one, which shows as a flicker of the previous search
   * term every time the URL changes.
   */
  const [lastInitial, setLastInitial] = useState(initial)
  if (initial !== lastInitial) {
    setLastInitial(initial)
    setValue(initial)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const onChange = (next: string) => {
    setValue(next)
    clearTimeout(timer.current)
    // 300ms: long enough to avoid a query per keystroke, short enough that the
    // result still feels like a response to typing.
    timer.current = setTimeout(() => update(paramName, next.trim() || null), 300)
  }

  return (
    <div className={cn('relative w-full sm:max-w-xs', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className="pr-9 pl-9"
      />
      {pending ? (
        <Loader2
          className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      ) : value ? (
        <button
          type="button"
          onClick={() => {
            setValue('')
            clearTimeout(timer.current)
            update(paramName, null)
          }}
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

export type FilterOption = { value: string; label: string }

export function FilterSelect({
  paramName,
  options,
  allLabel = 'All',
  label,
  className,
}: {
  paramName: string
  options: FilterOption[]
  allLabel?: string
  label: string
  className?: string
}) {
  const { update, searchParams } = useQueryUpdater()
  const current = searchParams.get(paramName) ?? '__all'

  return (
    <Select
      value={current}
      onValueChange={(value) => update(paramName, value === '__all' ? null : value)}
    >
      <SelectTrigger className={cn('w-full sm:w-[190px]', className)} aria-label={label}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Lays out search and filters, with a reset that clears all of them at once. */
export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasFilters = [...searchParams.keys()].some((key) => key !== 'page')

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center', className)}>
      {children}
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.replace(pathname, { scroll: false })}
          className="text-muted-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
