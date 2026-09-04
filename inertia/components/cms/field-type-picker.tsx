import {
  AlignLeft,
  AtSign,
  Boxes,
  Braces,
  Calendar,
  CalendarClock,
  Copy,
  FileText,
  Hash,
  Image as ImageIcon,
  KeyRound,
  Link2,
  ListChecks,
  Sigma,
  ToggleLeft,
  Type,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { CmsFieldType } from "~/types/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";

type FieldTypeCategory = "default" | "custom";

export interface FieldTypeMeta {
  type: CmsFieldType;
  label: string;
  description: string;
  icon: LucideIcon;
  category: FieldTypeCategory;
  /** Key into {@link TILE_TONE} for the colored icon tile. */
  tone: keyof typeof TILE_TONE;
}

/** Soft tinted tiles, Strapi-style, one tone per field family. */
const TILE_TONE = {
  emerald:
    "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  violet:
    "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  indigo:
    "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
} as const;

/**
 * Rich metadata for the field-type picker — icon, description and tile color
 * for each supported {@link CmsFieldType}. Kept here (not in schema-builder)
 * so the picker stays self-contained.
 */
export const FIELD_TYPE_META: ReadonlyArray<FieldTypeMeta> = [
  {
    type: "TEXT",
    label: "Text",
    description: "Single-line text like a title or name",
    icon: Type,
    category: "default",
    tone: "emerald",
  },
  {
    type: "TEXTAREA",
    label: "Long text",
    description: "Multi-line plain text",
    icon: AlignLeft,
    category: "default",
    tone: "emerald",
  },
  {
    type: "EMAIL",
    label: "Email",
    description: "Email address with format validation",
    icon: AtSign,
    category: "default",
    tone: "sky",
  },
  {
    type: "NUMBER",
    label: "Number",
    description: "Integer or decimal numbers",
    icon: Hash,
    category: "default",
    tone: "rose",
  },
  {
    type: "INTEGER",
    label: "Integer",
    description: "Whole numbers only",
    icon: Hash,
    category: "default",
    tone: "rose",
  },
  {
    type: "DECIMAL",
    label: "Decimal",
    description: "Numbers with a fractional part",
    icon: Sigma,
    category: "default",
    tone: "rose",
  },
  {
    type: "BOOL",
    label: "Boolean",
    description: "Yes or no, true or false",
    icon: ToggleLeft,
    category: "default",
    tone: "emerald",
  },
  {
    type: "DATE",
    label: "Date",
    description: "A calendar date",
    icon: Calendar,
    category: "default",
    tone: "amber",
  },
  {
    type: "DATETIME",
    label: "Date & time",
    description: "Date with time (stored as UTC)",
    icon: CalendarClock,
    category: "default",
    tone: "amber",
  },
  {
    type: "SELECT",
    label: "Enumeration",
    description: "Pick one from a list of values",
    icon: ListChecks,
    category: "default",
    tone: "violet",
  },
  {
    type: "MEDIA",
    label: "Media",
    description: "Reference an image or file asset",
    icon: ImageIcon,
    category: "default",
    tone: "violet",
  },
  {
    type: "RICHTEXT",
    label: "Rich text",
    description: "Formatted document with styling",
    icon: FileText,
    category: "custom",
    tone: "sky",
  },
  {
    type: "SLUG",
    label: "Slug",
    description: "URL-friendly id, auto-generated from a field",
    icon: Link2,
    category: "custom",
    tone: "indigo",
  },
  {
    type: "PASSWORD",
    label: "Password",
    description: "Hashed secret, never shown after saving",
    icon: KeyRound,
    category: "custom",
    tone: "amber",
  },
  {
    type: "RELATION",
    label: "Relation",
    description: "Link entries to another collection",
    icon: Workflow,
    category: "custom",
    tone: "violet",
  },
  {
    type: "COMPONENT",
    label: "Component",
    description: "A reusable group of fields, single or repeatable",
    icon: Boxes,
    category: "custom",
    tone: "indigo",
  },
  {
    type: "JSON",
    label: "JSON",
    description: "Freeform structured data",
    icon: Braces,
    category: "custom",
    tone: "sky",
  },
  {
    type: "REPEATABLE",
    label: "Repeatable",
    description: "A repeatable group of sub-fields",
    icon: Copy,
    category: "custom",
    tone: "indigo",
  },
];

export const FIELD_TYPE_META_BY_TYPE = Object.fromEntries(
  FIELD_TYPE_META.map((m) => [m.type, m]),
) as Record<CmsFieldType, FieldTypeMeta>;

const DEFAULT_TYPES = FIELD_TYPE_META.filter((m) => m.category === "default");
const CUSTOM_TYPES = FIELD_TYPE_META.filter((m) => m.category === "custom");

/** Reusable colored icon tile for a field type (cards, headers, lists). */
export function FieldTypeIconTile({
  type,
  className,
}: {
  type: CmsFieldType;
  className?: string;
}) {
  const meta = FIELD_TYPE_META_BY_TYPE[type];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md",
        TILE_TONE[meta.tone],
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

/** A single Strapi-style field-type card: colored icon tile + title + description. */
function FieldTypeCard({
  meta,
  selected,
  onSelect,
}: {
  meta: FieldTypeMeta;
  selected: boolean;
  onSelect: (type: CmsFieldType) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(meta.type)}
      aria-pressed={selected}
      className={cn(
        "group flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition-all",
        "hover:border-foreground/25 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-foreground/40 bg-accent/60"
          : "border-border",
      )}
    >
      <FieldTypeIconTile type={meta.type} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight text-foreground">
          {meta.label}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
          {meta.description}
        </span>
      </span>
    </button>
  );
}

function FieldTypeGrid({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<FieldTypeMeta>;
  value: CmsFieldType | null;
  onChange: (type: CmsFieldType) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {items.map((meta) => (
        <FieldTypeCard
          key={meta.type}
          meta={meta}
          selected={value === meta.type}
          onSelect={onChange}
        />
      ))}
    </div>
  );
}

/**
 * Strapi-style field-type picker. A two-tab (Default / Advanced) grid of
 * cards, each showing a colored icon tile, the type name and a short
 * description. Selecting a card calls `onChange` with the chosen type.
 */
export function FieldTypePicker({
  value,
  onChange,
  className,
  exclude,
}: {
  value: CmsFieldType | null;
  onChange: (type: CmsFieldType) => void;
  className?: string;
  /** Field types to hide from the picker (e.g. RELATION when creating a collection). */
  exclude?: ReadonlyArray<CmsFieldType>;
}) {
  const hidden = exclude && exclude.length ? new Set(exclude) : null;
  const defaultItems = hidden
    ? DEFAULT_TYPES.filter((m) => !hidden.has(m.type))
    : DEFAULT_TYPES;
  const customItems = hidden
    ? CUSTOM_TYPES.filter((m) => !hidden.has(m.type))
    : CUSTOM_TYPES;

  // Open the tab that holds the current selection so it's visible on mount.
  const selectedMeta = value ? FIELD_TYPE_META_BY_TYPE[value] : undefined;
  const defaultTab = selectedMeta?.category ?? "default";

  return (
    <Tabs defaultValue={defaultTab} className={cn("gap-4", className)}>
      <TabsList>
        <TabsTrigger value="default">Default</TabsTrigger>
        <TabsTrigger value="custom">Advanced</TabsTrigger>
      </TabsList>
      <TabsContent value="default" className="mt-0">
        <FieldTypeGrid items={defaultItems} value={value} onChange={onChange} />
      </TabsContent>
      <TabsContent value="custom" className="mt-0">
        <FieldTypeGrid items={customItems} value={value} onChange={onChange} />
      </TabsContent>
    </Tabs>
  );
}
