'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, getDefaultClassNames, type DayPickerProps } from 'react-day-picker'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A month calendar, styled to the platform's own tokens.
 *
 * `react-day-picker` supplies the behaviour that is genuinely hard: month
 * arithmetic, keyboard navigation across a grid, and the ARIA a date grid needs
 * to be usable by a screen reader. Only the classes are ours, merged over the
 * library's defaults rather than replacing them, so a version that adds a new
 * element still renders sensibly instead of unstyled.
 */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: DayPickerProps) {
  const defaults = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        ...defaults,

        months: cn(defaults.months, 'relative flex flex-col gap-4'),
        month: cn(defaults.month, 'flex flex-col gap-4'),
        month_caption: cn(defaults.month_caption, 'flex h-9 items-center justify-center'),
        caption_label: cn(defaults.caption_label, 'text-sm font-medium'),

        nav: cn(defaults.nav, 'absolute inset-x-0 top-0 flex items-center justify-between'),
        button_previous: cn(
          buttonVariants({ variant: 'outline', size: 'icon' }),
          'size-7 bg-transparent p-0 opacity-60 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline', size: 'icon' }),
          'size-7 bg-transparent p-0 opacity-60 hover:opacity-100',
        ),

        month_grid: cn(defaults.month_grid, 'w-full border-collapse'),
        weekdays: cn(defaults.weekdays, 'flex'),
        weekday: cn(
          defaults.weekday,
          'text-muted-foreground w-9 text-[11px] font-normal',
        ),
        week: cn(defaults.week, 'mt-1 flex w-full'),

        day: cn(defaults.day, 'p-0 text-center text-sm'),
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-9 rounded-md p-0 font-normal aria-selected:opacity-100',
        ),

        selected: cn(
          defaults.selected,
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
        ),
        today: cn(defaults.today, '[&>button]:bg-accent [&>button]:text-accent-foreground'),
        outside: cn(defaults.outside, 'text-muted-foreground/50'),
        disabled: cn(defaults.disabled, 'text-muted-foreground/40'),
        hidden: cn(defaults.hidden, 'invisible'),

        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === 'left' ? (
            <ChevronLeft className="size-4" {...rest} />
          ) : (
            <ChevronRight className="size-4" {...rest} />
          ),
      }}
      {...props}
    />
  )
}
