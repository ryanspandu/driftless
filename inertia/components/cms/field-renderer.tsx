
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { CmsFieldDto, CmsRecordDto } from "~/types/api";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { AppSelect } from "~/components/ui/app-select";
import { useCmsRecordsList } from "~/hooks/api/use-cms-records";
import { useCmsComponentsList } from "~/hooks/api/use-cms-components";
import {
  readComponentFields,
  type ComponentSubField,
} from "~/components/cms/component-schema-editor";
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
    case "INTEGER":
      return (
        <div className="space-y-1">
          {label}
          <Input
            type="number"
            step="1"
            value={numberOrEmpty(value)}
            onChange={(e) =>
              onChange(
                e.target.value === ""
                  ? null
                  : Math.trunc(Number(e.target.value)),
              )
            }
            disabled={disabled}
          />
        </div>
      );
    case "DECIMAL":
      return (
        <div className="space-y-1">
          {label}
          <Input
            type="number"
            step="any"
            value={numberOrEmpty(value)}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            disabled={disabled}
          />
        </div>
      );
    case "EMAIL":
      return (
        <div className="space-y-1">
          {label}
          <Input
            type="email"
            value={stringOr(value, "")}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : e.target.value)
            }
            disabled={disabled}
            placeholder="name@example.com"
            autoComplete="off"
          />
        </div>
      );
    case "PASSWORD":
      return (
        <div className="space-y-1">
          {label}
          <Input
            type="password"
            value={stringOr(value, "")}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : e.target.value)
            }
            disabled={disabled}
            placeholder="•••••••• (leave blank to keep current)"
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            Stored hashed; never shown after saving. Leave blank to keep the
            current value.
          </p>
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
    case "RELATION":
      return (
        <div className="space-y-1">
          {label}
          <RelationField
            field={field}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        </div>
      );
    case "COMPONENT":
      return (
        <div className="space-y-1">
          {label}
          <ComponentField
            field={field}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
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

/** A short human label for a related record (first text-ish field, else id). */
function recordLabel(r: CmsRecordDto): string {
  const data = (r.data ?? {}) as Record<string, unknown>;
  for (const k of ["title", "name", "label", "slug"]) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  for (const v of Object.values(data)) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return r.id;
}

/**
 * Relation picker. Single-FK relations (many-to-one / one-to-one) render a
 * single-select; list relations (many-to-many / one-to-many) render a
 * searchable multi-select of the target collection's entries.
 */
function RelationField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsFieldDto;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const targetKey =
    typeof field.config.targetKey === "string" ? field.config.targetKey : "";
  const relationType =
    typeof field.config.relationType === "string"
      ? field.config.relationType
      : "manyToOne";
  const multi = relationType === "manyToMany" || relationType === "oneToMany";

  const { data, isLoading } = useCmsRecordsList(targetKey, { pageSize: 100 });
  const records = data?.items ?? [];

  if (!targetKey) {
    return (
      <p className="text-xs text-destructive">
        This relation has no target collection configured.
      </p>
    );
  }

  if (multi) {
    const selected = Array.isArray(value)
      ? (value.filter((v) => typeof v === "string") as string[])
      : [];
    const toggle = (id: string) =>
      onChange(
        selected.includes(id)
          ? selected.filter((x) => x !== id)
          : [...selected, id],
      );
    return (
      <RelationMultiField
        records={records}
        selected={selected}
        onToggle={toggle}
        targetKey={targetKey}
        isLoading={isLoading}
        disabled={disabled}
      />
    );
  }

  const options = [
    { value: "", label: "— None —" },
    ...records.map((r) => ({ value: r.id, label: recordLabel(r) })),
  ];
  return (
    <div className="space-y-1">
      <AppSelect
        value={typeof value === "string" ? value : ""}
        disabled={disabled || isLoading}
        onChange={(v) => onChange(v ? v : null)}
        options={options}
        placeholder={isLoading ? "Loading entries…" : "Select an entry…"}
        isSearchable={records.length > 8}
      />
      <p className="text-xs text-muted-foreground">
        Linked to <code>{targetKey}</code>.
      </p>
    </div>
  );
}

/** Searchable checkbox list for many-to-many / one-to-many relations. */
function RelationMultiField({
  records,
  selected,
  onToggle,
  targetKey,
  isLoading,
  disabled,
}: {
  records: CmsRecordDto[];
  selected: string[];
  onToggle: (id: string) => void;
  targetKey: string;
  isLoading: boolean;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filtered = q
    ? records.filter((r) => recordLabel(r).toLowerCase().includes(q))
    : records;

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={isLoading ? "Loading entries…" : "Search entries…"}
        disabled={disabled || isLoading}
        autoComplete="off"
      />
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border bg-muted/20 p-2">
        {filtered.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            {isLoading ? "Loading…" : "No entries."}
          </p>
        ) : (
          filtered.map((r) => (
            <label
              key={r.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(r.id)}
                disabled={disabled}
                onCheckedChange={() => onToggle(r.id)}
              />
              <span className="truncate">{recordLabel(r)}</span>
            </label>
          ))
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length} selected · linked to <code>{targetKey}</code>.
      </p>
    </div>
  );
}

/** Build a minimal field DTO so a component sub-field reuses {@link FieldRenderer}. */
function toSubFieldDto(sub: ComponentSubField, idx: number): CmsFieldDto {
  return {
    id: `sub-${sub.key}-${idx}`,
    key: sub.key,
    label: sub.label,
    type: sub.type,
    required: false,
    unique: false,
    order: idx,
    config: {},
  };
}

/**
 * Structured editor for a COMPONENT field. Reads the inline sub-field schema
 * from `config.fields` and renders each sub-field recursively via
 * {@link FieldRenderer}. Single = an object; repeatable = an array of objects
 * with add / remove / reorder.
 */
function ComponentField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CmsFieldDto;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const componentKey =
    typeof field.config.componentKey === "string"
      ? field.config.componentKey
      : "";
  const { data: components } = useCmsComponentsList();
  const repeatable = field.config.repeatable === true;

  // Resolve the schema: a saved component from the registry, or inline fields.
  const subFields: ComponentSubField[] = componentKey
    ? ((components?.find((c) => c.key === componentKey)
        ?.fields as ComponentSubField[]) ?? [])
    : readComponentFields(field.config);

  if (subFields.length === 0) {
    return (
      <p className="text-xs text-destructive">
        {componentKey
          ? `Component "${componentKey}" is missing or empty.`
          : "This component has no fields configured."}
      </p>
    );
  }

  if (!repeatable) {
    const obj =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return (
      <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
        {subFields.map((sub, i) => (
          <FieldRenderer
            key={sub.key}
            field={toSubFieldDto(sub, i)}
            value={obj[sub.key]}
            onChange={(v) => onChange({ ...obj, [sub.key]: v })}
            disabled={disabled}
          />
        ))}
      </div>
    );
  }

  const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const setItems = (next: Record<string, unknown>[]) => onChange(next);
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setItems(next);
  };

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          No items yet.
        </p>
      ) : (
        items.map((item, idx) => (
          // eslint-disable-next-line react/no-array-index-key -- positional items
          <div key={idx} className="space-y-4 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Item {idx + 1}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={disabled || idx === 0}
                  onClick={() => move(idx, -1)}
                  aria-label="Move up"
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={disabled || idx === items.length - 1}
                  onClick={() => move(idx, 1)}
                  aria-label="Move down"
                >
                  <ChevronDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive"
                  disabled={disabled}
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  aria-label="Remove item"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            {subFields.map((sub, i) => (
              <FieldRenderer
                key={sub.key}
                field={toSubFieldDto(sub, i)}
                value={item[sub.key]}
                onChange={(v) =>
                  setItems(
                    items.map((it, k) =>
                      k === idx ? { ...it, [sub.key]: v } : it,
                    ),
                  )
                }
                disabled={disabled}
              />
            ))}
          </div>
        ))
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={disabled}
        onClick={() => setItems([...items, {}])}
      >
        <Plus className="size-4" />
        Add item
      </Button>
    </div>
  );
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
  // PostgreSQL BIGINT (INTEGER fields) comes back from the pg driver as a
  // string — render it rather than treating it as empty.
  if (typeof value === "bigint") return value.toString();
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    !Number.isNaN(Number(value))
  ) {
    return value;
  }
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
