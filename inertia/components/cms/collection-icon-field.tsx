
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Loader2, Search, Upload } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import { imageFileToResizedDataUrl } from "~/lib/image-data-url";
import {
  COLLECTION_PRESET_ICONS,
  isCustomCollectionIcon,
} from "~/components/cms/collection-icon-lucide";

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

/**
 * Preset Lucide icons + optional JPEG data URL for custom sidebar icons.
 */
export function CollectionIconField({
  id,
  label = "Icon",
  value,
  onChange,
  disabled,
}: Props) {
  const autoId = useId();
  const fieldId = id ?? `coll-icon-${autoId}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iconQuery, setIconQuery] = useState("");

  const custom = isCustomCollectionIcon(value);

  const filteredPresets = useMemo(() => {
    const q = iconQuery.trim().toLowerCase();
    if (!q) return COLLECTION_PRESET_ICONS;
    return COLLECTION_PRESET_ICONS.filter(({ name }) =>
      name.toLowerCase().includes(q),
    );
  }, [iconQuery]);

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file || disabled) return;
      if (!file.type.startsWith("image/")) {
        setError("Please choose an image file.");
        return;
      }
      setError(null);
      setBusy(true);
      try {
        const dataUrl = await imageFileToResizedDataUrl(file, {
          maxDim: 96,
          maxDataUrlChars: 500_000,
        });
        onChange(dataUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not process image.");
      } finally {
        setBusy(false);
      }
    },
    [disabled, onChange],
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <p className="text-xs text-muted-foreground">
        Pick a preset or upload a square image (shown in the sidebar).
      </p>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={`${fieldId}-search`}
          type="search"
          value={iconQuery}
          onChange={(e) => setIconQuery(e.target.value)}
          placeholder="Search icons by name…"
          disabled={disabled || busy}
          className="h-9 pl-9"
          autoComplete="off"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {filteredPresets.length} of {COLLECTION_PRESET_ICONS.length} icons
        {iconQuery.trim() ? ` matching “${iconQuery.trim()}”` : ""}
      </p>
      <div
        className="max-h-52 min-h-[8.5rem] w-full overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-muted/20 p-2"
        role="group"
        aria-label="Preset icons"
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2">
          {filteredPresets.map(({ name, Icon }) => {
            const selected = !custom && value.trim() === name;
            return (
              <button
                key={name}
                type="button"
                disabled={disabled || busy}
                title={name}
                onClick={() => onChange(name)}
                className={cn(
                  "flex size-10 cursor-pointer items-center justify-center rounded-md border bg-background transition-colors",
                  "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            );
          })}
        </div>
        {filteredPresets.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No icons match your search. Try another name (e.g. &quot;Mail&quot;,
            &quot;Camera&quot;).
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="sr-only"
          id={`${fieldId}-file`}
          disabled={disabled || busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          Upload custom image
        </Button>
        {custom ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || busy}
            onClick={() => onChange("LayoutList")}
          >
            Use preset instead
          </Button>
        ) : null}
      </div>

      {custom ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview */}
          <img
            src={value.trim()}
            alt=""
            className="size-12 rounded object-contain"
          />
          <p className="text-xs text-muted-foreground">
            Custom image is stored with this collection (JPEG, resized for size).
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
