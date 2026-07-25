
import { Link } from '@inertiajs/react'
import { useEffect, useId, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, GripVertical, Loader2, Plus, Save, Trash2, Workflow, X } from "lucide-react";
import type {
  AddCmsFieldRequest,
  CmsCollectionDto,
  CmsFieldDto,
  CmsFieldType,
} from "~/types/api";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Switch } from "~/components/ui/switch";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  emptyFieldDraft,
  isValidKey,
  keyHint,
  type SchemaFieldDraft,
} from "~/components/cms/schema-builder";
import {
  FieldTypeIconTile,
  FieldTypePicker,
  FIELD_TYPE_META_BY_TYPE,
} from "~/components/cms/field-type-picker";
import {
  ComponentSchemaEditor,
  componentSchemaError,
} from "~/components/cms/component-schema-editor";
import { useCmsComponentsList } from "~/hooks/api/use-cms-components";
import {
  useAddCmsField,
  useCmsCollection,
  useCmsCollectionsList,
  useRemoveCmsField,
  useReorderCmsFields,
  useUpdateCmsCollection,
} from "~/hooks/api/use-cms-collections";
import { ComboboxInput } from "~/components/ui/combobox-input";
import { AppSelect } from "~/components/ui/app-select";
import { CollectionIconPicker } from "~/components/cms/collection-icon-popover";
import {
  isCustomCollectionIcon,
  resolveCollectionLucideIcon,
} from "~/components/cms/collection-icon-lucide";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "~/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

/**
 * Single-collection editor. Native (Prisma-backed) collections are readonly
 * at the schema level; dynamic collections support renaming metadata and
 * adding/removing fields at runtime.
 */
interface SettingsForm {
  label: string;
  icon: string;
  group: string;
  revisionsOn: boolean;
  draftsOn: boolean;
  kind: "collection" | "single";
}

function baselineOf(c: CmsCollectionDto): SettingsForm {
  return {
    label: c.label,
    icon: c.icon ?? "LayoutList",
    group: c.group ?? "",
    revisionsOn: c.revisionsOn,
    draftsOn: c.draftsOn,
    kind: c.kind ?? "collection",
  };
}

export default function CmsCollectionDetailPage({ collectionKey: key }: { collectionKey: string }) {
  const [fieldDeleteKey, setFieldDeleteKey] = useState<string | null>(null);
  const [tab, setTab] = useState("settings");
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const query = useCmsCollection(key);
  const updateMut = useUpdateCmsCollection(key);
  const addFieldMut = useAddCmsField(key);
  const removeFieldMut = useRemoveCmsField(key);
  const reorderFieldsMut = useReorderCmsFields(key);

  const collection = query.data;
  const isNative = collection?.source === "PRISMA";
  const listQuery = useCmsCollectionsList();
  const groupOptions = useMemo(
    () =>
      Array.from(
        new Set(
          (listQuery.data ?? [])
            .map((c) => c.group?.trim())
            .filter((g): g is string => !!g),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [listQuery.data],
  );

  // Reset local settings edits when navigating to a different collection.
  useEffect(() => {
    setForm(null);
    setSaveError(null);
    setTab("settings");
  }, [key]);

  const baseline = collection ? baselineOf(collection) : null;
  // Until the user edits, mirror the server values (no flash, no init effect).
  const activeForm = form ?? baseline;
  const dirty =
    !!form && !!baseline && JSON.stringify(form) !== JSON.stringify(baseline);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateMut.mutateAsync({
        label: form.label,
        icon: form.icon.trim() ? form.icon.trim() : null,
        group: form.group.trim() ? form.group.trim() : null,
        revisionsOn: form.revisionsOn,
        draftsOn: form.draftsOn,
        kind: form.kind,
      });
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const headerIcon = activeForm?.icon || collection?.icon || "LayoutList";
  const headerCustom = isCustomCollectionIcon(headerIcon);
  const HeaderIcon = resolveCollectionLucideIcon(headerIcon || "LayoutList");

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          render={<Link href="/admin/cms/collections" />}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/50 text-foreground/80">
          {headerCustom ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL / remote icon
            <img src={headerIcon} alt="" className="size-full object-cover" />
          ) : (
            <HeaderIcon className="size-5" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {collection?.label ?? key}
            </h1>
            {collection ? (
              <Badge variant="secondary">
                {isNative ? "Native" : "Dynamic"}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {collection ? (
              <code className="font-mono">{collection.key}</code>
            ) : query.isLoading ? (
              "Loading…"
            ) : (
              "Not found"
            )}
            {isNative ? " · schema managed by developers" : null}
          </p>
        </div>
        {collection ? (
          <Button
            variant="outline"
            className="hidden shrink-0 gap-2 sm:inline-flex"
            render={
              <Link href={`/admin/cms/${encodeURIComponent(collection.key)}`} />
            }
          >
            Open records →
          </Button>
        ) : null}
      </div>

      {query.error ? (
        <p className="text-sm text-destructive">
          {(query.error as Error).message}
        </p>
      ) : null}

      {collection && activeForm ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="fields" className="gap-1.5">
              Fields
              <span className="text-muted-foreground">
                {collection.fields.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="mt-4">
            <SettingsPanel
              form={activeForm}
              onChange={setForm}
              disabled={isNative}
              groupOptions={groupOptions}
              error={saveError}
            />
          </TabsContent>

          <TabsContent value="fields" className="mt-4">
            <ExistingFieldsCard
              collection={collection}
              actionsDisabled={
                isNative ||
                removeFieldMut.isPending ||
                reorderFieldsMut.isPending
              }
              onReorderFieldKeys={
                isNative
                  ? undefined
                  : (orderedKeys) =>
                      reorderFieldsMut.mutate({ fieldKeys: orderedKeys })
              }
              onRemove={(fieldKey) => setFieldDeleteKey(fieldKey)}
              headerAction={
                !isNative ? (
                  <AddFieldDialog
                    disabled={addFieldMut.isPending}
                    existingKeys={collection.fields.map((f) => f.key)}
                    relationTargets={(listQuery.data ?? []).filter(
                      (c) => c.source === "DYNAMIC",
                    )}
                    onAdd={(body) => addFieldMut.mutateAsync(body)}
                  />
                ) : null
              }
            />
          </TabsContent>
        </Tabs>
      ) : null}

      {collection && activeForm && !isNative ? (
        <div className="sticky bottom-4 z-20 flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-2.5 shadow-sm">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {dirty ? (
              <>
                <span className="size-2 rounded-full bg-amber-500" aria-hidden />
                Unsaved changes
              </>
            ) : null}
          </span>
          <div className="flex items-center gap-2">
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => baseline && setForm(baseline)}
                disabled={saving}
              >
                Discard
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save settings
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={fieldDeleteKey !== null}
        onOpenChange={(open) => {
          if (!open) setFieldDeleteKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove field</DialogTitle>
            <DialogDescription>
              This will archive the column{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                {fieldDeleteKey ?? ""}
              </code>
              . Existing cell values are kept under an archived column name.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={removeFieldMut.isPending}
              onClick={() => setFieldDeleteKey(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              disabled={removeFieldMut.isPending || !fieldDeleteKey}
              onClick={() => {
                if (!fieldDeleteKey) return;
                removeFieldMut.mutate(fieldDeleteKey, {
                  onSuccess: () => setFieldDeleteKey(null),
                });
              }}
            >
              {removeFieldMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Remove field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsPanel({
  form,
  onChange,
  disabled,
  groupOptions,
  error,
}: {
  form: SettingsForm;
  onChange: (next: SettingsForm) => void;
  disabled: boolean;
  groupOptions: string[];
  error: string | null;
}) {
  const set = (patch: Partial<SettingsForm>) => onChange({ ...form, ...patch });

  return (
    <Card>
      <CardContent className="divide-y p-0">
        <section className="grid gap-6 p-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <h3 className="text-sm font-medium">General</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Name, icon and grouping shown across the admin.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input
                value={form.label}
                onChange={(e) => set({ label: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <CollectionIconPicker
                  value={form.icon}
                  onChange={(v) => set({ icon: v })}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Group</Label>
                <ComboboxInput
                  value={form.group}
                  onChange={(v) => set({ group: v })}
                  disabled={disabled}
                  options={groupOptions}
                  placeholder="e.g. Content"
                  className="[&_input]:h-9"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 p-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <h3 className="text-sm font-medium">Type</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              How many entries this collection holds.
            </p>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="coll-single" className="cursor-pointer">
                <span className="block text-sm">Single type</span>
                <span className="block text-xs text-muted-foreground">
                  Exactly one entry (e.g. a homepage or global settings). No
                  list view — opens straight to the entry.
                </span>
              </label>
              <Switch
                id="coll-single"
                checked={form.kind === "single"}
                disabled={disabled}
                onCheckedChange={(v) =>
                  set({ kind: v ? "single" : "collection" })
                }
              />
            </div>
          </div>
        </section>

        <section className="grid gap-6 p-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <h3 className="text-sm font-medium">Publishing</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              How entries are versioned and staged.
            </p>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="coll-revisions" className="cursor-pointer">
                <span className="block text-sm">Track revisions</span>
                <span className="block text-xs text-muted-foreground">
                  Keep a history of every change.
                </span>
              </label>
              <Switch
                id="coll-revisions"
                checked={form.revisionsOn}
                disabled={disabled}
                onCheckedChange={(v) => set({ revisionsOn: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="coll-drafts" className="cursor-pointer">
                <span className="block text-sm">Enable drafts</span>
                <span className="block text-xs text-muted-foreground">
                  Separate draft and published states.
                </span>
              </label>
              <Switch
                id="coll-drafts"
                checked={form.draftsOn}
                disabled={disabled}
                onCheckedChange={(v) => set({ draftsOn: v })}
              />
            </div>
          </div>
        </section>

        {error ? (
          <div className="px-6 py-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExistingFieldsCard({
  collection,
  actionsDisabled,
  onReorderFieldKeys,
  onRemove,
  headerAction,
}: {
  collection: CmsCollectionDto;
  actionsDisabled: boolean;
  onReorderFieldKeys?: (orderedKeys: string[]) => void;
  onRemove: (fieldKey: string) => void;
  headerAction?: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const fields = collection.fields;
  const dataFields = fields.filter((f) => f.type !== "RELATION");
  const relationFields = fields.filter((f) => f.type === "RELATION");
  const count = fields.length;

  const onDragEnd = (event: DragEndEvent) => {
    if (!onReorderFieldKeys) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = dataFields.findIndex((f) => f.id === active.id);
    const newIndex = dataFields.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(dataFields, oldIndex, newIndex);
    // Relations live in their own section and aren't reordered — keep their
    // keys after the reordered data fields so order indices stay contiguous.
    onReorderFieldKeys([
      ...reordered.map((f) => f.key),
      ...relationFields.map((f) => f.key),
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Fields</CardTitle>
            <CardDescription>
              {count} field{count === 1 ? "" : "s"}. Drag the handle to reorder.
              Removing a field soft-archives the column.
            </CardDescription>
          </div>
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={dataFields.map((f) => f.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-2">
              {dataFields.map((field) => (
                <SortableExistingFieldRow
                  key={field.id}
                  field={field}
                  actionsDisabled={actionsDisabled}
                  reorderDisabled={!onReorderFieldKeys}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {relationFields.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Workflow className="size-4 text-muted-foreground" aria-hidden />
              <h4 className="text-sm font-medium">Relations</h4>
              <Badge variant="outline" className="text-[11px]">
                {relationFields.length}
              </Badge>
            </div>
            {relationFields.map((field) => (
              <RelationFieldRow
                key={field.id}
                field={field}
                actionsDisabled={actionsDisabled}
                onRemove={onRemove}
              />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RelationFieldRow({
  field,
  actionsDisabled,
  onRemove,
}: {
  field: CmsFieldDto;
  actionsDisabled: boolean;
  onRemove: (fieldKey: string) => void;
}) {
  const targetKey =
    typeof field.config.targetKey === "string" ? field.config.targetKey : "?";
  const relationType =
    typeof field.config.relationType === "string"
      ? field.config.relationType
      : "manyToOne";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{field.label}</span>
          <code className="font-mono text-xs text-muted-foreground">
            {field.key}
          </code>
          <Badge variant="outline" className="text-xs">
            → {targetKey} · {relationType}
          </Badge>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-destructive"
        disabled={actionsDisabled}
        onClick={() => onRemove(field.key)}
        aria-label={`Remove ${field.key}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function SortableExistingFieldRow({
  field,
  actionsDisabled,
  reorderDisabled,
  onRemove,
}: {
  field: CmsFieldDto;
  actionsDisabled: boolean;
  reorderDisabled: boolean;
  onRemove: (fieldKey: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id, disabled: reorderDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
    >
      {!reorderDisabled ? (
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Drag to reorder ${field.key}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{field.label}</span>
          <code className="font-mono text-xs text-muted-foreground">
            {field.key}
          </code>
          <Badge variant="outline" className="text-xs">
            {field.type}
          </Badge>
          {field.required ? (
            <Badge variant="secondary" className="text-xs">
              required
            </Badge>
          ) : null}
          {field.unique ? (
            <Badge variant="secondary" className="text-xs">
              unique
            </Badge>
          ) : null}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-destructive"
        disabled={actionsDisabled}
        onClick={() => onRemove(field.key)}
        aria-label={`Remove ${field.key}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

const RELATION_TYPE_OPTIONS = [
  { value: "manyToOne", label: "Many to one" },
  { value: "oneToOne", label: "One to one" },
  { value: "manyToMany", label: "Many to many" },
  { value: "oneToMany", label: "One to many" },
];

function AddFieldDialog({
  disabled,
  existingKeys,
  relationTargets,
  onAdd,
}: {
  disabled: boolean;
  existingKeys: string[];
  relationTargets: CmsCollectionDto[];
  onAdd: (body: AddCmsFieldRequest) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SchemaFieldDraft>(emptyFieldDraft());
  // No type is highlighted until the user actually picks one (draft.type has a
  // default so the picker can't infer "unselected" on its own).
  const [picked, setPicked] = useState(false);
  // "type" shows the Strapi-style picker grid; "config" names the chosen field.
  const [step, setStep] = useState<"type" | "config">("type");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // COMPONENT fields can reference a saved component or define fields inline.
  const [componentMode, setComponentMode] = useState<"saved" | "inline">(
    "inline",
  );
  const componentsQuery = useCmsComponentsList();
  const componentOptions = (componentsQuery.data ?? []).map((c) => ({
    value: c.key,
    label: c.label,
  }));
  const keyError = keyHint(draft.key);
  const duplicate = existingKeys.includes(draft.key);
  const relationOk =
    draft.type !== "RELATION" ||
    (typeof draft.config.targetKey === "string" &&
      draft.config.targetKey.trim().length > 0);
  const componentOk =
    draft.type !== "COMPONENT" ||
    (componentMode === "saved"
      ? typeof draft.config.componentKey === "string" &&
        draft.config.componentKey.length > 0
      : componentSchemaError(draft.config) === null);
  const canSubmit =
    isValidKey(draft.key) &&
    !duplicate &&
    draft.label.trim().length > 0 &&
    relationOk &&
    componentOk &&
    !disabled &&
    !saving;

  const reset = () => {
    setDraft(emptyFieldDraft());
    setPicked(false);
    setStep("type");
    setError(null);
    setComponentMode("inline");
  };

  const handleOpenChange = (next: boolean) => {
    if (saving) return;
    setOpen(next);
    if (!next) reset();
  };

  const handlePickType = (type: CmsFieldType) => {
    setDraft((prev) => ({
      ...prev,
      type,
      config:
        type === "RELATION"
          ? { relationType: "manyToOne" }
          : type === "COMPONENT"
            ? { repeatable: false, fields: [] }
            : {},
    }));
    setPicked(true);
    setStep("config");
  };

  const handleAdd = async () => {
    setError(null);
    setSaving(true);
    try {
      await onAdd({
        key: draft.key,
        label: draft.label,
        type: draft.type,
        required: draft.required,
        unique: draft.unique,
        config: draft.config,
      });
      setOpen(false);
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const formId = useId();
  const labelId = `${formId}-label`;
  const keyId = `${formId}-key`;
  const keyMessage = keyError ?? (duplicate ? "Key already exists." : null);
  const meta = FIELD_TYPE_META_BY_TYPE[draft.type];
  const relationTargetOptions = relationTargets.map((c) => ({
    value: c.key,
    label: c.label,
  }));

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        Add field
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
          <DialogHeader>
            <DialogTitle>Add field</DialogTitle>
            <DialogDescription>
              {step === "type"
                ? "Select a field type for this collection."
                : "Name the field and set its constraints."}
            </DialogDescription>
          </DialogHeader>

          {step === "type" ? (
            <FieldTypePicker
              value={picked ? draft.type : null}
              onChange={handlePickType}
            />
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <FieldTypeIconTile type={draft.type} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">
                    {meta?.label ?? draft.type}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {meta?.description}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep("type")}
                >
                  Change type
                </Button>
              </div>

              {draft.type === "RELATION" ? (
                <div className="space-y-4 rounded-lg border border-border/80 bg-muted/35 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    Relation
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Target collection</Label>
                      <AppSelect
                        value={
                          typeof draft.config.targetKey === "string"
                            ? draft.config.targetKey
                            : ""
                        }
                        onChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            config: { ...prev.config, targetKey: v },
                          }))
                        }
                        options={relationTargetOptions}
                        placeholder="Select a collection…"
                        isSearchable={relationTargetOptions.length > 8}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Relationship</Label>
                      <AppSelect
                        value={
                          typeof draft.config.relationType === "string"
                            ? draft.config.relationType
                            : "manyToOne"
                        }
                        onChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            config: { ...prev.config, relationType: v },
                          }))
                        }
                        options={RELATION_TYPE_OPTIONS}
                      />
                    </div>
                  </div>
                  {relationTargetOptions.length === 0 ? (
                    <p className="text-xs text-destructive">
                      No dynamic collections available to link to.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {draft.type === "COMPONENT" ? (
                <div className="space-y-4 rounded-lg border border-border/80 bg-muted/35 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      Component
                    </p>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={draft.config.repeatable === true}
                        onCheckedChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            config: { ...prev.config, repeatable: v === true },
                          }))
                        }
                      />
                      Repeatable
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={componentMode === "saved" ? "default" : "outline"}
                      onClick={() => {
                        setComponentMode("saved");
                        setDraft((prev) => ({
                          ...prev,
                          config: {
                            repeatable: prev.config.repeatable === true,
                            componentKey:
                              typeof prev.config.componentKey === "string"
                                ? prev.config.componentKey
                                : "",
                          },
                        }));
                      }}
                    >
                      Saved component
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={
                        componentMode === "inline" ? "default" : "outline"
                      }
                      onClick={() => {
                        setComponentMode("inline");
                        setDraft((prev) => ({
                          ...prev,
                          config: {
                            repeatable: prev.config.repeatable === true,
                            fields: Array.isArray(prev.config.fields)
                              ? prev.config.fields
                              : [],
                          },
                        }));
                      }}
                    >
                      Define inline
                    </Button>
                  </div>

                  {componentMode === "saved" ? (
                    componentOptions.length === 0 ? (
                      <p className="text-xs text-destructive">
                        No saved components yet — create one under Components, or
                        define fields inline.
                      </p>
                    ) : (
                      <AppSelect
                        value={
                          typeof draft.config.componentKey === "string"
                            ? draft.config.componentKey
                            : ""
                        }
                        onChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            config: { ...prev.config, componentKey: v },
                          }))
                        }
                        options={componentOptions}
                        placeholder="Select a component…"
                        isSearchable={componentOptions.length > 8}
                      />
                    )
                  ) : (
                    <ComponentSchemaEditor
                      config={draft.config}
                      onChange={(config) =>
                        setDraft((prev) => ({ ...prev, config }))
                      }
                      showRepeatable={false}
                    />
                  )}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={labelId}>Label</Label>
                  <Input
                    id={labelId}
                    value={draft.label}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, label: e.target.value }))
                    }
                    placeholder="e.g. Hero image"
                    autoComplete="off"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={keyId}>Key</Label>
                  <Input
                    id={keyId}
                    value={draft.key}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        key: e.target.value.toLowerCase(),
                      }))
                    }
                    placeholder="hero_image"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-sm"
                    aria-invalid={!!keyMessage}
                    aria-describedby={keyMessage ? `${keyId}-err` : undefined}
                  />
                  <div className="min-h-[1.25rem]">
                    {keyMessage ? (
                      <p id={`${keyId}-err`} className="text-xs text-destructive">
                        {keyMessage}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/80 bg-muted/35 p-4">
                <p className="mb-3 text-xs font-medium text-muted-foreground">
                  Constraints
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-2">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <Checkbox
                      checked={draft.required}
                      onCheckedChange={(v) =>
                        setDraft((prev) => ({ ...prev, required: v === true }))
                      }
                    />
                    <span>Required</span>
                  </label>
                  {["TEXT", "SLUG", "NUMBER"].includes(draft.type) ? (
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                      <Checkbox
                        checked={draft.unique}
                        onCheckedChange={(v) =>
                          setDraft((prev) => ({ ...prev, unique: v === true }))
                        }
                      />
                      <span>Unique</span>
                    </label>
                  ) : null}
                </div>
              </div>

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          )}

          {step === "config" ? (
            <DialogFooter>
              <Button
                type="button"
                onClick={handleAdd}
                disabled={!canSubmit}
                className="gap-2 min-w-[9rem]"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add field
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
