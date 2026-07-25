import { useState } from 'react'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Calendar } from '~/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { cn } from '~/lib/utils'

/** Local `yyyy-mm-dd` string from a Date (avoids UTC off-by-one of toISOString). */
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Date picker over the styled {@link Calendar} (react-day-picker) in a popover.
 * Value is an ISO `yyyy-mm-dd` string (or null when cleared).
 */
export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = 'Pick a date',
  className,
}: {
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(`${value}T00:00:00`) : undefined
  const label = selected
    ? selected.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              'h-9 w-full justify-start gap-2 px-3 font-normal',
              !selected && 'text-muted-foreground',
              className
            )}
          />
        }
      >
        <CalendarIcon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange(d ? toISODate(d) : null)
            setOpen(false)
          }}
        />
        {selected ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
