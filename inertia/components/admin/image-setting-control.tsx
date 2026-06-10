
import { useCallback, useId, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import { imageFileToResizedDataUrl } from "~/lib/image-data-url";

export type ImageSettingPreview = "square" | "wide";

type Props = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  /** Shown when resetting (e.g. `/logo.svg`). */
  defaultAsset: string;
  resetLabel?: string;
  disabled?: boolean;
  preview?: ImageSettingPreview;
  /** Max width for wide preview */
  maxWideClassName?: string;
};

/**
 * Upload image → data URL (resized) + preview; used for website settings sections.
 */
export function ImageSettingControl({
  label,
  value,
  onChange,
  defaultAsset,
  resetLabel = "Use default",
  disabled,
  preview = "square",
  maxWideClassName = "max-w-lg",
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File | undefined) => {
      if (!file || disabled) return;
      if (!file.type.startsWith("image/")) {
        setError("Please choose an image file.");
        return;
      }
      setError(null);
      setBusy(true);
      try {
        const dataUrl = await imageFileToResizedDataUrl(
          file,
          preview === "wide" ? { maxDim: 1920, maxDataUrlChars: 2_000_000 } : undefined,
        );
        onChange(dataUrl);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not process image.");
      } finally {
        setBusy(false);
      }
    },
    [disabled, onChange, preview],
  );

  const showReset =
    Boolean(value) && value !== defaultAsset;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          void processFile(file);
          e.target.value = "";
        }}
      />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-4">
        <div
          className={cn(
            "shrink-0 overflow-hidden rounded-lg border bg-background",
            preview === "square" && "flex size-16 items-center justify-center",
            preview === "wide" &&
              cn("relative h-36 w-full", maxWideClassName),
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value || defaultAsset}
            alt=""
            className={cn(
              preview === "square" && "max-h-full max-w-full object-contain",
              preview === "wide" && "size-full object-cover object-center",
            )}
            onError={(e) => {
              (e.target as HTMLImageElement).src = defaultAsset;
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Upload className="mr-2 size-4" />
            )}
            Upload image
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={disabled || busy || !showReset}
            onClick={() => {
              onChange(defaultAsset);
              setError(null);
            }}
          >
            <Trash2 className="mr-1 size-3.5" />
            {resetLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
