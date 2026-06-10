
import { useEffect, useMemo, useRef, useState } from "react";
import type { CmsFieldDto } from "~/types/api";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { AppSelect } from "~/components/ui/app-select";
import { RichTextEditor } from "./rich-text-editor";

interface FieldRendererProps {
  field: CmsFieldDto;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

/**
 * Generic, unstyled-by-convention renderer that maps each `CmsFieldType` to
 * an appropriate input control. Keeps all field-specific UI centralized so
 * the record form and inline editors share the same behaviour.
 */
export function FieldRenderer({
  field,
  value,
  onChange,
  disabled,
}: FieldRendererProps) {
  const label = (
    <div className="flex items-center gap-2">
      <Label>{field.label}</Label>
      {field.required ? (
        <span className="text-xs text-destructive">*</span>
      ) : null}
    </div>
  );

  switch (field.type) {
    case "TEXT":
    case "SLUG":
      return (
        <div className="space-y-1">
          {label}
          <Input
            value={stringOr(value, "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={
              field.type === "SLUG"
                ? "auto-generated if blank"
                : undefined
            }
          />
          {field.type === "SLUG" ? (
            <p className="text-xs text-muted-foreground">
              Lowercase, hyphen-separated. Auto-generated from{" "}
              <code>{String(field.config.source ?? "source")}</code> when empty.
            </p>
          ) : null}
        </div>
      );
    case "TEXTAREA":
      return (
        <div className="space-y-1">
          {label}
          <textarea
            className="flex min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            value={stringOr(value, "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      );
    case "RICHTEXT":
      return (
        <div className="space-y-1">
          {label}
          <RichTextEditor
            value={value}
            onChange={onChange}
            disabled={disabled}
            placeholder="Write the article body here…"
          />
        </div>
      );
    case "JSON":
      return (
        <div className="space-y-1">
          {label}
          <JsonEditor
            value={value}
            onChange={onChange}
            disabled={disabled}
            placeholder="{}"
          />
        </div>
      );
    case "REPEATABLE":
      return (
        <div className="space-y-1">
          {label}
          <JsonEditor
            value={value ?? []}
            onChange={onChange}
            disabled={disabled}
            placeholder="[]"
          />
          <p className="text-xs text-muted-foreground">
            Array of items. Full visual builder arrives post-MVP.
          </p>
        </div>
      );
    case "NUMBER":
      return (
        <div className="space-y-1">
          {label}
          <Input
            type="number"
            value={numberOrEmpty(value)}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            disabled={disabled}
          />
        </div>
      );
    case "BOOL":
      return (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={Boolean(value)}
            disabled={disabled}
            onCheckedChange={(v) => onChange(v === true)}
          />
          {field.label}
        </label>
      );
    case "DATE":
    case "DATETIME":
      return (
        <div className="space-y-1">
          {label}
          <Input
            type={field.type === "DATE" ? "date" : "datetime-local"}
            value={dateInputValue(value, field.type)}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : e.target.value)
            }
            disabled={disabled}
          />
        </div>
      );
    case "SELECT": {
      const options = Array.isArray(field.config.options)
        ? (field.config.options as string[])
        : [];
      const selectOptions = options.map((opt) => ({
        value: opt,
        label: opt,
      }));
      return (
        <div className="space-y-1">
          {label}
          <AppSelect
            value={typeof value === "string" ? value : ""}
            disabled={disabled}
            onChange={(v) => onChange(v)}
            options={selectOptions}
            placeholder="Select…"
            isSearchable={options.length > 8}
          />
        </div>
      );
    }
    case "MEDIA":
      return (
        <div className="space-y-1">
          {label}
          <Input
            value={stringOr(value, "")}
            onChange={(e) =>
              onChange(e.target.value.trim() === "" ? null : e.target.value)
            }
            disabled={disabled}
            placeholder="media-id"
          />
          <p className="text-xs text-muted-foreground">
            Paste a Media id. A picker component arrives with the Media UI.
          </p>
        </div>
      );
    default:
      return (
        <div className="space-y-1">
          {label}
          <Input
            value={stringOr(value, "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      );
  }
}

function stringOr(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  return fallback;
}

function numberOrEmpty(value: unknown): string {
  if (typeof value === "number" && !Number.isNaN(value)) return value.toString();
  return "";
}

function dateInputValue(value: unknown, type: "DATE" | "DATETIME"): string {
  if (typeof value !== "string" || !value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  if (type === "DATE") return d.toISOString().slice(0, 10);
  const iso = d.toISOString();
  return iso.slice(0, 16);
}

function JsonEditor({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const initial = useMemo(() => {
    if (value === null || value === undefined) return "";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "";
    }
  }, [value]);

  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const lastEmitted = useRef<string>(initial);

  useEffect(() => {
    if (initial !== lastEmitted.current) {
      queueMicrotask(() => {
        setText(initial);
        lastEmitted.current = initial;
        setError(null);
      });
    }
  }, [initial]);

  return (
    <div className="space-y-1">
      <textarea
        className="flex min-h-28 w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (!raw.trim()) {
            setError(null);
            lastEmitted.current = raw;
            onChange(null);
            return;
          }
          try {
            const parsed = JSON.parse(raw) as unknown;
            setError(null);
            lastEmitted.current = raw;
            onChange(parsed);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      {error ? (
        <p className="text-xs text-destructive">Invalid JSON · {error}</p>
      ) : null}
    </div>
  );
}
