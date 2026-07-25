import { useState } from 'react'
import { DateTime } from 'luxon'
import type { DateRange } from 'react-day-picker'
import { CalendarDays } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Calendar } from '~/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { cn } from '~/lib/utils'

/** Both values are date-only ISO strings (`YYYY-MM-DD`). */
export type DateRangeValue = { from?: string; to?: string }

function toDate(s?: string): Date | undefined {
  if (!s) return undefined
  const dt = DateTime.fromISO(s)
  return dt.isValid ? dt.toJSDate() : undefined
}

function toISO(d?: Date): string | undefined {
  if (!d) return undefined
  return DateTime.fromJSDate(d).toISODate() ?? undefined
}

function label(s?: string): string | null {
  const d = toDate(s)
  return d ? DateTime.fromJSDate(d).toFormat('dd LLL yyyy') : null
}

const PRESETS: { label: string; range: () => DateRangeValue }[] = [
  {
    label: 'Today',
    range: () => {
      const t = DateTime.now().toISODate()!
      return { from: t, to: t }
    },
  },
  {
    label: 'Last 7 days',
    range: () => ({
      from: DateTime.now().minus({ days: 6 }).toISODate()!,
      to: DateTime.now().toISODate()!,
    }),
  },
  {
    label: 'Last 30 days',
    range: () => ({
      from: DateTime.now().minus({ days: 29 }).toISODate()!,
      to: DateTime.now().toISODate()!,
    }),
  },
  {
    label: 'This month',
    range: () => ({
      from: DateTime.now().startOf('month').toISODate()!,
      to: DateTime.now().toISODate()!,
    }),
  },
]

export function DateRangePicker({
  value,
  onChange,
  className,
  align = 'start',
  placeholder = 'Pick a date range',
}: {
  value: DateRangeValue
  onChange: (next: DateRangeValue) => void
  className?: string
  align?: 'start' | 'center' | 'end'
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)

  const selected: DateRange | undefined = value.from
    ? { from: toDate(value.from), to: toDate(value.to) }
    : undefined

  const from = label(value.from)
  const to = label(value.to)
  const text = from ? (to ? (from === to ? from : `${from} – ${to}`) : `${from} – …`) : null
  const hasValue = Boolean(value.from || value.to)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              'h-9 w-[16rem] justify-start gap-2 font-normal',
              !hasValue && 'text-muted-foreground',
              className
            )}
          />
        }
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{text ?? placeholder}</span>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto">
        <div className="flex flex-col sm:flex-row">
          <div className="flex shrink-0 flex-row flex-wrap gap-1 border-b p-2 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(p.range())}
                className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onChange({})
                setOpen(false)
              }}
              className="rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Clear
            </button>
          </div>
          <Calendar
            mode="range"
            numberOfMonths={2}
            defaultMonth={toDate(value.from) ?? new Date()}
            selected={selected}
            onSelect={(range) => onChange({ from: toISO(range?.from), to: toISO(range?.to) })}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
