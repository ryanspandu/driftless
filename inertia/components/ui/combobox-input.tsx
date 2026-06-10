
import * as React from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '~/lib/utils'

export interface ComboboxInputProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  id?: string
  name?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  createLabel?: string
  emptyLabel?: string
}

function getScrollParents(el: HTMLElement | null): HTMLElement[] {
  const parents: HTMLElement[] = []
  if (!el) return parents
  let p: HTMLElement | null = el.parentElement
  while (p) {
    const { overflow, overflowY, overflowX } = getComputedStyle(p)
    const combined = `${overflow}${overflowY}${overflowX}`
    if (/(auto|scroll|overlay)/.test(combined)) parents.push(p)
    p = p.parentElement
  }
  return parents
}

export function ComboboxInput({
  value,
  onChange,
  options,
  id,
  name,
  placeholder,
  disabled,
  className,
  createLabel = 'Create',
  emptyLabel = 'No matches',
}: ComboboxInputProps) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const listboxId = `${inputId}-listbox`

  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)
  const [mounted, setMounted] = React.useState(false)
  const [panelRect, setPanelRect] = React.useState({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 256,
  })

  const rootRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLUListElement>(null)
  const listPortalRef = React.useRef<HTMLUListElement>(null)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const normalized = React.useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of options) {
      const v = (raw ?? '').trim()
      if (!v || seen.has(v)) continue
      seen.add(v)
      out.push(v)
    }
    out.sort((a, b) => a.localeCompare(b))
    return out
  }, [options])

  const q = value.trim()
  const filtered = React.useMemo(() => {
    if (!q) return normalized
    const lo = q.toLowerCase()
    return normalized.filter((o) => o.toLowerCase().includes(lo))
  }, [normalized, q])

  const showCreate =
    q.length > 0 && !normalized.some((o) => o.toLowerCase() === q.toLowerCase())

  type Entry = { kind: 'option' | 'create'; value: string }
  const entries = React.useMemo<Entry[]>(() => {
    const arr: Entry[] = filtered.map((o) => ({ kind: 'option', value: o }))
    if (showCreate) arr.unshift({ kind: 'create', value: q })
    return arr
  }, [filtered, showCreate, q])

  const updatePanelPosition = React.useCallback(() => {
    const anchor = rootRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const gap = 4
    const preferredMax = 256
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8
    const spaceAbove = rect.top - gap - 8
    const maxHeight = Math.min(preferredMax, Math.max(spaceBelow, spaceAbove, 120))
    setPanelRect({
      top: rect.bottom + gap,
      left: rect.left,
      width: rect.width,
      maxHeight,
    })
  }, [])

  React.useLayoutEffect(() => {
    if (!open) return
    updatePanelPosition()
  }, [open, updatePanelPosition, entries.length])

  React.useEffect(() => {
    if (!open) return
    updatePanelPosition()
    const onWin = () => updatePanelPosition()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, { passive: true, capture: true })
    const scrollParents = getScrollParents(rootRef.current)
    for (const el of scrollParents) {
      el.addEventListener('scroll', onWin, { passive: true })
    }
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, { capture: true })
      for (const el of scrollParents) {
        el.removeEventListener('scroll', onWin)
      }
    }
  }, [open, updatePanelPosition])

  React.useEffect(() => {
    if (highlight >= entries.length) setHighlight(0)
  }, [entries.length, highlight])

  React.useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (listPortalRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  const commit = React.useCallback(
    (v: string) => {
      onChange(v)
      setOpen(false)
      inputRef.current?.blur()
    },
    [onChange]
  )

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlight((h) => (entries.length ? (h + 1) % entries.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) setOpen(true)
      setHighlight((h) => (entries.length ? (h - 1 + entries.length) % entries.length : 0))
    } else if (e.key === 'Enter') {
      if (open && entries.length > 0) {
        e.preventDefault()
        const picked = entries[highlight] ?? entries[0]
        commit(picked.value)
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setOpen(false)
      }
    }
  }

  React.useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (!list) return
    const el = list.querySelector<HTMLLIElement>(`[data-index="${highlight}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const listContent = (
    <ul
      ref={(node) => {
        listRef.current = node
        listPortalRef.current = node
      }}
      id={listboxId}
      role="listbox"
      style={{
        position: 'fixed',
        top: panelRect.top,
        left: panelRect.left,
        width: panelRect.width,
        maxHeight: panelRect.maxHeight,
        zIndex: 9999,
      }}
      className="overflow-auto rounded-lg border border-input bg-popover p-1 text-sm shadow-lg outline-none"
    >
      {entries.length === 0 ? (
        <li className="px-2 py-1.5 text-muted-foreground">{emptyLabel}</li>
      ) : (
        entries.map((entry, idx) => {
          const isActive = idx === highlight
          const isSelected =
            entry.kind === 'option' && entry.value.toLowerCase() === q.toLowerCase()
          return (
            <li
              key={`${entry.kind}:${entry.value}:${idx}`}
              role="option"
              aria-selected={isSelected}
              data-index={idx}
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => {
                e.preventDefault()
                commit(entry.value)
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5',
                isActive && 'bg-accent text-accent-foreground'
              )}
            >
              {entry.kind === 'create' ? (
                <>
                  <span className="inline-flex size-4 items-center justify-center text-muted-foreground">
                    +
                  </span>
                  <span className="truncate">
                    {createLabel} <span className="font-medium">&ldquo;{entry.value}&rdquo;</span>
                  </span>
                </>
              ) : (
                <>
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      isSelected ? 'text-foreground' : 'text-transparent'
                    )}
                  />
                  <span className="truncate">{entry.value}</span>
                </>
              )}
            </li>
          )
        })
      )}
    </ul>
  )

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          role="combobox"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setHighlight(0)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pl-2.5 pr-8 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80'
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            if (disabled) return
            setOpen((o) => !o)
            inputRef.current?.focus()
          }}
          aria-label={open ? 'Close' : 'Open'}
          className="absolute inset-y-0 right-0 flex w-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {mounted && open && !disabled ? createPortal(listContent, document.body) : null}
    </div>
  )
}
