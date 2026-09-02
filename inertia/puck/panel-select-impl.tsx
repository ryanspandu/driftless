import { useMemo } from 'react'
import { AppSelect } from '~/components/ui/app-select'
import { cn } from '~/lib/utils'
import type { PanelSelectProps } from './panel-select'
import { autoSearchable, panelSelectOptions } from './panel-select-options'

/** The proven compact recipe (see `admin/article-editor.tsx`). */
const CONTROL = '!h-7 !min-h-7 !rounded-md !px-2 !shadow-none'

export function PanelSelectImpl({
  id,
  value,
  onChange,
  options,
  emptyLabel,
  placeholder = 'Select…',
  isClearable = false,
  isSearchable,
  disabled,
  className,
  controlClassName,
}: PanelSelectProps) {
  const opts = useMemo(() => panelSelectOptions(options, emptyLabel), [options, emptyLabel])
  const searchable = useMemo(() => isSearchable ?? autoSearchable(opts), [isSearchable, opts])
  return (
    <AppSelect
      id={id}
      size="sm"
      value={value ?? ''}
      onChange={onChange}
      options={opts}
      placeholder={placeholder}
      isClearable={isClearable}
      isSearchable={searchable}
      disabled={disabled}
      className={className}
      controlClassName={cn(CONTROL, controlClassName)}
    />
  )
}
