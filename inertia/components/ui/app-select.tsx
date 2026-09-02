import { useId, useMemo, type ReactNode } from 'react'
import ReactSelect, {
  type GroupBase,
  type Props as ReactSelectProps,
  type SingleValue,
} from 'react-select'
import { cn } from '~/lib/utils'

export type AppSelectOption = {
  value: string
  label: string
  /** Optional leading node (e.g. an avatar / icon) shown in the menu + value. */
  icon?: ReactNode
  /** Shown but not selectable. */
  isDisabled?: boolean
}

/** A labelled group of options — rendered with a heading, like `<optgroup>`. */
export type AppSelectGroup = {
  label: string
  options: AppSelectOption[]
}

export type AppSelectOptions = AppSelectOption[] | AppSelectGroup[]

export interface AppSelectProps {
  'id'?: string
  /** Current value; must match an option `value` or use empty string with optional placeholder-only state. */
  'value': string
  'onChange': (value: string) => void
  'options': AppSelectOptions
  'placeholder'?: string
  'disabled'?: boolean
  /** @default true — typeahead like Select2 */
  'isSearchable'?: boolean
  'isClearable'?: boolean
  /** @default "default" */
  'size'?: 'sm' | 'default'
  'className'?: string
  /** Extra class on the control (width, etc.) */
  'controlClassName'?: string
  'aria-invalid'?: boolean
}

const sizeClasses = {
  sm: 'min-h-8 text-xs',
  default: 'min-h-9 text-sm',
} as const

function isGroup(item: AppSelectOption | AppSelectGroup): item is AppSelectGroup {
  return 'options' in item
}

/** Every selectable option, groups unwrapped. */
export function flattenOptions(options: AppSelectOptions): AppSelectOption[] {
  return (options as Array<AppSelectOption | AppSelectGroup>).flatMap((item) =>
    isGroup(item) ? item.options : [item]
  )
}

/**
 * Project default for dropdowns: react-select (searchable, portal menu, theme-aware).
 * Prefer this over native `<select>` or legacy Base UI select.
 */
export function AppSelect({
  'id': idProp,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  isSearchable = true,
  isClearable = false,
  size = 'default',
  className,
  controlClassName,
  'aria-invalid': invalid,
}: AppSelectProps) {
  const rid = useId()
  const inputId = idProp ?? `app-select-${rid}`
  const instanceId = useMemo(() => inputId.replace(/[^a-zA-Z0-9_-]/g, ''), [inputId])

  const selected = useMemo(
    () => flattenOptions(options).find((o) => o.value === value) ?? null,
    [options, value]
  )

  const common: ReactSelectProps<AppSelectOption, false, GroupBase<AppSelectOption>> = {
    inputId,
    instanceId,
    value: selected,
    onChange: (opt: SingleValue<AppSelectOption>) => {
      onChange(opt?.value ?? '')
    },
    options,
    placeholder,
    isDisabled: disabled,
    isSearchable,
    isClearable,
    isOptionDisabled: (o) => !!o.isDisabled,
    ...selectPresentation<false>({ size, invalid, className, controlClassName }),
  }

  return <ReactSelect<AppSelectOption, false> {...common} />
}

const MENU_CLASS_PREFIX = 'app-select'

/**
 * The look of a select, split out so the multi-value variant is the *same*
 * control rather than a lookalike that drifts from it the first time either is
 * restyled.
 */
export function selectPresentation<IsMulti extends boolean>({
  size = 'default',
  invalid,
  className,
  controlClassName,
}: {
  size?: 'sm' | 'default'
  invalid?: boolean
  className?: string
  controlClassName?: string
}): Partial<ReactSelectProps<AppSelectOption, IsMulti, GroupBase<AppSelectOption>>> {
  return {
    // Render an optional per-option icon (e.g. an avatar) in both the menu and
    // the selected value; plain options fall back to the label string.
    formatOptionLabel: (opt: AppSelectOption) =>
      opt.icon != null ? (
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex shrink-0 items-center">{opt.icon}</span>
          <span className="truncate">{opt.label}</span>
        </span>
      ) : (
        opt.label
      ),
    menuPosition: 'fixed',
    menuPortalTarget: typeof document !== 'undefined' ? document.body : undefined,
    // Flip upward when there is no room below — a select at the bottom of a
    // scrolling side panel would otherwise open off-screen.
    menuPlacement: 'auto',
    classNamePrefix: MENU_CLASS_PREFIX,
    /**
     * With `menuPosition: fixed` the menu is placed once, when opened; if the
     * scroll container around the control then scrolls, the menu stays put and
     * floats away from its control. Close it on any scroll except the menu
     * list's own.
     */
    closeMenuOnScroll: (event) => {
      const target = event.target
      return !(target instanceof Element && target.closest(`.${MENU_CLASS_PREFIX}__menu`))
    },
    styles: {
      menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    },
    unstyled: true,
    classNames: {
      control: ({ isFocused, isDisabled: dis }) =>
        cn(
          'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-foreground shadow-xs outline-none transition-colors',
          sizeClasses[size],
          isFocused && 'border-ring ring-2 ring-ring/35 ring-offset-0 ring-offset-background',
          dis && 'cursor-not-allowed opacity-50',
          invalid && 'border-destructive ring-2 ring-destructive/25 dark:border-destructive/60',
          controlClassName
        ),
      valueContainer: () => 'flex min-w-0 flex-1 flex-wrap gap-1 py-0.5',
      placeholder: () => 'text-muted-foreground',
      input: () => 'm-0 min-w-[4px] text-inherit',
      singleValue: () => 'truncate',
      indicatorsContainer: () => 'flex shrink-0 items-center gap-0.5',
      dropdownIndicator: () => 'text-muted-foreground p-0.5',
      clearIndicator: () => 'text-muted-foreground p-0.5 hover:text-foreground',
      menu: () =>
        'mt-1 overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-md',
      menuList: () =>
        cn(
          'max-h-[min(20rem,var(--radix-select-content-available-height,300px))] overflow-y-auto p-1',
          size === 'sm' ? 'text-xs' : 'text-sm'
        ),
      // Unstyled mode renders group wrappers/headings with no styles at all.
      group: () => 'py-1 first:pt-0 [&+&]:mt-1 [&+&]:border-t [&+&]:border-border',
      groupHeading: () =>
        'px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground',
      option: ({ isFocused, isSelected, isDisabled: dis }) =>
        cn(
          'cursor-pointer rounded-md px-2 py-1',
          size === 'sm' ? 'text-xs' : 'text-sm',
          isFocused && 'bg-accent text-accent-foreground',
          isSelected && 'bg-accent/80 font-medium',
          dis && 'cursor-not-allowed opacity-50'
        ),
      noOptionsMessage: () => 'px-2 py-1.5 text-sm text-muted-foreground',
      multiValue: () => 'flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-foreground',
      multiValueLabel: () => (size === 'sm' ? 'text-xs' : 'text-sm'),
      multiValueRemove: () =>
        'cursor-pointer rounded-sm text-muted-foreground hover:bg-destructive/15 hover:text-destructive',
    },
    className: cn('w-full', className),
    components: {
      IndicatorSeparator: () => null,
    },
  }
}
