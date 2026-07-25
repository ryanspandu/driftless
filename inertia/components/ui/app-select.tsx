
import { useId, useMemo, type ReactNode } from "react";
import ReactSelect, {
  type GroupBase,
  type Props as ReactSelectProps,
  type SingleValue,
} from "react-select";
import { cn } from "~/lib/utils";

export type AppSelectOption = {
  value: string;
  label: string;
  /** Optional leading node (e.g. an avatar / icon) shown in the menu + value. */
  icon?: ReactNode;
};

export interface AppSelectProps {
  id?: string;
  /** Current value; must match an option `value` or use empty string with optional placeholder-only state. */
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** @default true — typeahead like Select2 */
  isSearchable?: boolean;
  isClearable?: boolean;
  /** @default "default" */
  size?: "sm" | "default";
  className?: string;
  /** Extra class on the control (width, etc.) */
  controlClassName?: string;
  "aria-invalid"?: boolean;
}

const sizeClasses = {
  sm: "min-h-8 text-xs",
  default: "min-h-9 text-sm",
} as const;

/**
 * Project default for dropdowns: react-select (searchable, portal menu, theme-aware).
 * Prefer this over native `<select>` or legacy Base UI select.
 */
export function AppSelect({
  id: idProp,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  isSearchable = true,
  isClearable = false,
  size = "default",
  className,
  controlClassName,
  "aria-invalid": invalid,
}: AppSelectProps) {
  const rid = useId();
  const inputId = idProp ?? `app-select-${rid}`;
  const instanceId = useMemo(() => inputId.replace(/[^a-zA-Z0-9_-]/g, ""), [inputId]);

  const selected = options.find((o) => o.value === value) ?? null;

  const common: ReactSelectProps<
    AppSelectOption,
    false,
    GroupBase<AppSelectOption>
  > = {
    inputId,
    instanceId,
    value: selected,
    onChange: (opt: SingleValue<AppSelectOption>) => {
      onChange(opt?.value ?? "");
    },
    options,
    placeholder,
    isDisabled: disabled,
    isSearchable,
    isClearable,
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
    menuPosition: "fixed",
    menuPortalTarget:
      typeof document !== "undefined" ? document.body : undefined,
    styles: {
      menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    },
    unstyled: true,
    classNames: {
      control: ({ isFocused, isDisabled: dis }) =>
        cn(
          "flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-foreground shadow-xs outline-none transition-colors",
          sizeClasses[size],
          isFocused &&
            "border-ring ring-2 ring-ring/35 ring-offset-0 ring-offset-background",
          dis && "cursor-not-allowed opacity-50",
          invalid &&
            "border-destructive ring-2 ring-destructive/25 dark:border-destructive/60",
          controlClassName,
        ),
      valueContainer: () => "flex min-w-0 flex-1 flex-wrap gap-1 py-0.5",
      placeholder: () => "text-muted-foreground",
      input: () => "m-0 min-w-[4px] text-inherit",
      singleValue: () => "truncate",
      indicatorsContainer: () => "flex shrink-0 items-center gap-0.5",
      dropdownIndicator: () => "text-muted-foreground p-0.5",
      clearIndicator: () => "text-muted-foreground p-0.5 hover:text-foreground",
      menu: () =>
        "mt-1 overflow-hidden rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-md",
      menuList: () =>
        cn(
          "max-h-[min(20rem,var(--radix-select-content-available-height,300px))] overflow-y-auto p-1",
          size === "sm" ? "text-xs" : "text-sm",
        ),
      option: ({ isFocused, isSelected }) =>
        cn(
          "cursor-pointer rounded-md px-2 py-1",
          size === "sm" ? "text-xs" : "text-sm",
          isFocused && "bg-accent text-accent-foreground",
          isSelected && "bg-accent/80 font-medium",
        ),
      noOptionsMessage: () => "px-2 py-1.5 text-sm text-muted-foreground",
    },
    className: cn("w-full", className),
    components: {
      IndicatorSeparator: () => null,
    },
  };

  return <ReactSelect<AppSelectOption, false> {...common} />;
}
