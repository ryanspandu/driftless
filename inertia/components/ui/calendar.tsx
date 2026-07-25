'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, getDefaultClassNames } from 'react-day-picker'

import { cn } from '~/lib/utils'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

/**
 * react-day-picker v10 styled with the app's Tailwind tokens (no base CSS), so
 * it follows dark/light automatically. Selection modifiers land on the day
 * *cell*; the inner button is targeted via `[&>button]`, and range_middle /
 * range_start / range_end use `!` to win over the generic `selected` class.
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const d = getDefaultClassNames()
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: cn(d.months, 'relative flex flex-col gap-4 sm:flex-row'),
        month: cn(d.month, 'flex w-full flex-col gap-4'),
        month_caption: cn(d.month_caption, 'flex h-8 items-center justify-center'),
        caption_label: cn(d.caption_label, 'text-sm font-medium'),
        nav: cn(d.nav, 'absolute inset-x-0 top-0 flex items-center justify-between'),
        button_previous: cn(
          d.button_previous,
          'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40'
        ),
        button_next: cn(
          d.button_next,
          'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40'
        ),
        month_grid: cn(d.month_grid, 'w-full border-collapse'),
        weekdays: cn(d.weekdays, 'flex'),
        weekday: cn(d.weekday, 'w-9 text-[0.72rem] font-normal text-muted-foreground'),
        week: cn(d.week, 'mt-1.5 flex w-full'),
        day: cn(d.day, 'relative size-9 p-0 text-center text-sm'),
        day_button: cn(
          d.day_button,
          'inline-flex size-9 items-center justify-center rounded-md font-normal text-foreground transition-colors hover:bg-accent hover:text-accent-foreground'
        ),
        selected: cn(
          d.selected,
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:rounded-md [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground'
        ),
        // Middle of a range: flat accent bar (transparent-ish button), `!` so it
        // beats the generic `selected` styling that every in-range day also gets.
        range_middle: cn(
          d.range_middle,
          '[&>button]:!rounded-none [&>button]:!bg-accent [&>button]:!text-accent-foreground [&>button]:hover:!bg-accent/70'
        ),
        today: cn(d.today, '[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-primary/50'),
        outside: cn(d.outside, '[&>button]:text-muted-foreground/40'),
        disabled: cn(d.disabled, '[&>button]:pointer-events-none [&>button]:opacity-40'),
        hidden: cn(d.hidden, 'invisible'),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: cl, ...rest }) => {
          const Icon = orientation === 'left' ? ChevronLeft : ChevronRight
          return <Icon className={cn('size-4', cl)} {...rest} />
        },
      }}
      {...props}
    />
  )
}

export { Calendar }
