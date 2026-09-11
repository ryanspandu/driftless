import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { CollectionIconField } from "~/components/cms/collection-icon-field";
import {
  isCustomCollectionIcon,
  resolveCollectionLucideIcon,
} from "~/components/cms/collection-icon-lucide";

/**
 * Compact icon picker: a button showing the current icon that opens a popover
 * with the searchable preset grid + custom upload (the full grid never sits
 * inline on the page). Reuses {@link CollectionIconField} for the picker body.
 */
export function CollectionIconPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const custom = isCustomCollectionIcon(value);
  const Icon = resolveCollectionLucideIcon(value || "LayoutList");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-9 w-full justify-start gap-2 px-2.5 font-normal"
          />
        }
      >
        {custom ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL preview
          <img src={value} alt="" className="size-5 rounded object-cover" />
        ) : (
          <Icon className="size-4 text-muted-foreground" aria-hidden />
        )}
        <span className="truncate text-sm">
          {custom ? "Custom image" : value || "LayoutList"}
        </span>
        <ChevronDown
          className="ml-auto size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <CollectionIconField
          value={value}
          onChange={(next) => {
            onChange(next);
            // Close after picking a preset; stay open after an upload so the
            // resulting preview is visible.
            if (!isCustomCollectionIcon(next)) setOpen(false);
          }}
          disabled={disabled}
          showHeader={false}
        />
      </PopoverContent>
    </Popover>
  );
}
