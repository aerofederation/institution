'use client'

import { useState } from 'react'

import { CalendarDays, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Picking a date and a time.
 *
 * Replaces `<input type="datetime-local">`, which renders as a row of typed
 * segments in most browsers — you cannot see the month, and setting a deadline
 * three weeks out means knowing the number of the day. A calendar answers
 * "which Friday" without arithmetic.
 *
 * The value travels as an absolute ISO instant in a hidden input under the same
 * `name` — see `toAbsolute` for why it cannot be the wall clock the teacher
 * sees. A form reading `FormData` needs no special handling.
 *
 * **The popover closes the moment a day is chosen, and the time sits outside
 * it.** The first version kept the calendar open so the time could be set
 * inside — which meant two pickers on the same form could both be open at once,
 * and a click would land in whichever calendar happened to come first in the
 * DOM. That was not theoretical: setting a closing date silently rewrote the
 * opening one. Closing on selection removes the state in which the bug exists,
 * and an always-visible time field is less clicking anyway.
 *
 * Setting a hidden input's value from React fires no `change` event, so forms
 * that autosave on `onChange` would never hear about a date. `onValueChange`
 * exists for those — the assessment details panel passes its autosave trigger.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

function splitValue(value: string) {
  const [date = '', time = ''] = value.split('T')
  return { date, time: TIME_PATTERN.test(time.slice(0, 5)) ? time.slice(0, 5) : '' }
}

/**
 * The instant the teacher actually meant.
 *
 * What they choose is a wall clock in their own timezone — "the 15th at 09:00".
 * A `YYYY-MM-DDTHH:mm` string carries no offset, and Postgres reads an
 * offsetless literal into `timestamptz` using the session timezone, which is
 * UTC. So 09:00 chosen in India was stored as 09:00Z and handed back as 14:30:
 * every paper opened and closed 5h30m later than it was set to, and the teacher
 * saw a time they had never typed.
 *
 * The browser is the only party that knows the teacher's offset, so it resolves
 * the instant here. The visible fields stay local; the hidden input carries UTC.
 */
export function toAbsolute(local: string) {
  if (!local) return ''
  const at = new Date(local)
  return Number.isNaN(at.getTime()) ? '' : at.toISOString()
}

/** Local parts, never `toISOString` — see the note in `chooseDate`. */
function toLocalDate(day: Date) {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
    day.getDate(),
  ).padStart(2, '0')}`
}

function formatDay(value: string) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function DateTimePicker({
  name,
  defaultValue = '',
  required = false,
  /** Time used when a date is chosen first. 09:00 for an opening, 23:59 for a deadline. */
  defaultTime = '09:00',
  disabled = false,
  onValueChange,
  id,
}: {
  name: string
  defaultValue?: string
  required?: boolean
  defaultTime?: string
  disabled?: boolean
  onValueChange?: (value: string) => void
  id?: string
}) {
  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)

  const { date, time } = splitValue(value)
  const selected = date ? new Date(`${date}T${time || defaultTime}`) : undefined
  const label = formatDay(value)

  const commit = (next: string) => {
    setValue(next)
    onValueChange?.(next)
  }

  const chooseDate = (day: Date | undefined) => {
    if (!day) return

    /*
     * Built from the local parts rather than `toISOString`, which shifts the
     * date across midnight for anyone east or west of UTC — a deadline set for
     * the 5th quietly becoming the 4th is the classic version of this bug.
     */
    commit(`${toLocalDate(day)}T${time || defaultTime}`)
    setOpen(false)
  }

  const chooseTime = (next: string) => {
    if (!TIME_PATTERN.test(next)) return

    // A time with no date yet lands on today, so the field is never in the
    // half-set state of carrying a time and no day.
    commit(`${date || toLocalDate(new Date())}T${next}`)
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* What the form actually submits — an instant, not a wall clock. */}
      <input type="hidden" name={name} value={toAbsolute(value)} />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            id={id}
            variant="outline"
            disabled={disabled}
            aria-required={required}
            className={cn(
              'h-9 min-w-0 flex-1 justify-start px-3 text-left font-normal',
              !label && 'text-muted-foreground',
            )}
          >
            <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{label ?? 'Choose a date'}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={chooseDate} autoFocus />
        </PopoverContent>
      </Popover>

      {/* Always visible, so the time can be changed without opening anything. */}
      <Input
        type="time"
        aria-label={`Time for ${name.replace(/_/g, ' ')}`}
        value={time || (date ? defaultTime : '')}
        disabled={disabled || !date}
        onChange={(event) => chooseTime(event.target.value)}
        className="h-9 w-28 shrink-0"
      />

      {/* Optional fields need a way back to empty; a required one does not. */}
      {value && !required ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          disabled={disabled}
          onClick={() => commit('')}
          aria-label={`Clear ${name.replace(/_/g, ' ')}`}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
