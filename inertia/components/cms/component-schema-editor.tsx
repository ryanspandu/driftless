import { Plus, Trash2 } from "lucide-react";
import type { CmsFieldType } from "~/types/api";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { AppSelect } from "~/components/ui/app-select";

export interface ComponentSubField {
  key: string;
  label: string;
  type: CmsFieldType;
}

/**
 * Sub-field types allowed inside a COMPONENT. Deliberately scalar-only — no
 * relation/password (no FK or hashing inside JSONB) and no nesting
 * (component/repeatable/json) to keep the structured editor finite.
 */
export const COMPONENT_SUBFIELD_TYPE_OPTIONS: {
  value: CmsFieldType;
  label: string;
}[] = [
  { value: "TEXT", label: "Text" },
  { value: "TEXTAREA", label: "Long text" },
  { value: "EMAIL", label: "Email" },
  { value: "RICHTEXT", label: "Rich text" },
  { value: "NUMBER", label: "Number" },
  { value: "INTEGER", label: "Integer" },
  { value: "DECIMAL", label: "Decimal" },
  { value: "BOOL", label: "Boolean" },
  { value: "DATE", label: "Date" },
  { value: "DATETIME", label: "Date & time" },
  { value: "MEDIA", label: "Media" },
];

const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;

function slugifyKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

/** Read the inline sub-field schema from a COMPONENT field's config. */
export function readComponentFields(
  config: Record<string, unknown>,
): ComponentSubField[] {
  const raw = config.fields;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      key: typeof f.key === "string" ? f.key : "",
      label: typeof f.label === "string" ? f.label : "",
      type: (typeof f.type === "string" ? f.type : "TEXT") as CmsFieldType,
    }));
}

/** Returns a user-facing error if the component schema is invalid, else null. */
export function componentSchemaError(
  config: Record<string, unknown>,
): string | null {
  const fields = readComponentFields(config);
  if (fields.length === 0) return "Add at least one sub-field.";
  const seen = new Set<string>();
  for (const f of fields) {
    if (!f.label.trim()) return "Every sub-field needs a label.";
    if (!KEY_RE.test(f.key)) return `Invalid sub-field key "${f.key || "?"}".`;
    if (seen.has(f.key)) return `Duplicate sub-field key "${f.key}".`;
    seen.add(f.key);
  }
  return null;
}

/**
 * Inline schema editor for a COMPONENT field: a repeatable toggle plus a list
 * of {label, key, type} sub-fields. Fully controlled via `config`.
 */
export function ComponentSchemaEditor({
  config,
  onChange,
  disabled,
  showRepeatable = true,
}: {
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
  /** Show the per-field "Repeatable" toggle (off when editing a registry component). */
  showRepeatable?: boolean;
}) {
  const fields = readComponentFields(config);
  const repeatable = config.repeatable === true;

  const setFields = (next: ComponentSubField[]) =>
    onChange({ ...config, fields: next });

  const addField = () =>
    setFields([...fields, { key: "", label: "", type: "TEXT" }]);
  const removeField = (i: number) =>
    setFields(fields.filter((_, idx) => idx !== i));
  const patchField = (i: number, patch: Partial<ComponentSubField>) =>
    setFields(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  return (
    <div className="space-y-4 rounded-lg border border-border/80 bg-muted/35 p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-medium text-muted-foreground">
          Component fields
        </p>
        {showRepeatable ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={repeatable}
              disabled={disabled}
              onCheckedChange={(v) =>
                onChange({ ...config, repeatable: v === true })
              }
            />
            Repeatable
          </label>
        ) : null}
      </div>

      <div className="space-y-2">
        {fields.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
            No sub-fields yet. Add at least one.
          </p>
        ) : (
          fields.map((f, i) => (
            <div
              // eslint-disable-next-line react/no-array-index-key -- rows are positional
              key={i}
              className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2"
            >
              <Input
                value={f.label}
                disabled={disabled}
                placeholder="Label"
                onChange={(e) => {
                  const label = e.target.value;
                  patchField(
                    i,
                    f.key ? { label } : { label, key: slugifyKey(label) },
                  );
                }}
              />
              <Input
                value={f.key}
                disabled={disabled}
                placeholder="key"
                className="font-mono text-xs"
                onChange={(e) => patchField(i, { key: slugifyKey(e.target.value) })}
              />
              <div className="w-36">
                <AppSelect
                  value={f.type}
                  disabled={disabled}
                  onChange={(v) => patchField(i, { type: v as CmsFieldType })}
                  options={COMPONENT_SUBFIELD_TYPE_OPTIONS}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-destructive"
                disabled={disabled}
                onClick={() => removeField(i)}
                aria-label="Remove sub-field"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={disabled}
        onClick={addField}
      >
        <Plus className="size-4" />
        Add sub-field
      </Button>
    </div>
  );
}
