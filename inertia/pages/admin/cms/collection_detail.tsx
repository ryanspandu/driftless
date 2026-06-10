
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
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, GripVertical, Loader2, Plus, Save, Trash2 } from "lucide-react";
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  emptyFieldDraft,
  FIELD_TYPE_CHOICES,
  FIELD_TYPE_SELECT_OPTIONS,
  isValidKey,
  keyHint,
  type SchemaFieldDraft,
} from "~/components/cms/schema-builder";
import {
  useAddCmsField,
  useCmsCollection,
  useCmsCollectionsList,
  useRemoveCmsField,
  useReorderCmsFields,
  useUpdateCmsCollection,
} from "~/hooks/api/use-cms-collections";
import { ComboboxInput } from "~/components/ui/combobox-input";
import { CollectionIconField } from "~/components/cms/collection-icon-field";
import { AppSelect } from "~/components/ui/app-select";
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
export default function CmsCollectionDetailPage({ collectionKey: key }: { collectionKey: string }) {
  const [fieldDeleteKey, setFieldDeleteKey] = useState<string | null>(null);
  
  const query = useCmsCollection(key);
  const updateMut = useUpdateCmsCollection(key);
  const addFieldMut = useAddCmsField(key);
  const removeFieldMut = useRemoveCmsField(key);
  const reorderFieldsMut = useReorderCmsFields(key);

  const collection = query.data;
  const isNative = collection?.source === "PRISMA";
  const listQuery = useCmsCollectionsList( );
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          render={<Link href="/admin/cms/collections" />}
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {collection?.label ?? key}
          </h1>
          <p className="text-sm text-muted-foreground">
            {collection ? (
              <>
                <code className="font-mono">{collection.key}</code> ·{" "}
                <Badge variant="secondary">
                  {isNative ? "Native" : "Dynamic"}
                </Badge>
                {isNative ? " (schema managed by developers)" : null}
              </>
            ) : query.isLoading ? (
              "Loading…"
            ) : (
              "Not found"
            )}
          </p>
        </div>
      </div>

      {query.error ? (
        <p className="text-sm text-destructive">
          {(query.error as Error).message}
        </p>
      ) : null}

      {collection ? (
        <>
          <CollectionMetaCard
            collection={collection}
            disabled={isNative || updateMut.isPending}
            groupOptions={groupOptions}
            onSave={(body) => updateMut.mutateAsync(body)}
          />
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
          />
          {!isNative ? (
            <AddFieldCard
              disabled={addFieldMut.isPending}
              existingKeys={collection.fields.map((f) => f.key)}
              onAdd={(body) => addFieldMut.mutateAsync(body)}
            />
          ) : null}
          <div className="flex justify-end">
            <Button
              className="gap-2"
              render={
                <Link
                  href={`/admin/cms/${encodeURIComponent(collection.key)}`}
                />
              }
            >
              Open records →
            </Button>
          </div>
        </>
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

function CollectionMetaCard({
  collection,
  disabled,
  groupOptions,
  onSave,
}: {
  collection: CmsCollectionDto;
  disabled: boolean;
  groupOptions: string[];
  onSave: (body: {
    label?: string;
    icon?: string | null;
    group?: string | null;
    revisionsOn?: boolean;
    draftsOn?: boolean;
  }) => Promise<unknown>;
}) {
  const [label, setLabel] = useState(collection.label);
  const [icon, setIcon] = useState(collection.icon ?? "");
  const [group, setGroup] = useState(collection.group ?? "");
  const [revisionsOn, setRevisionsOn] = useState(collection.revisionsOn);
  const [draftsOn, setDraftsOn] = useState(collection.draftsOn);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLabel(collection.label);
    setIcon(collection.icon ?? "LayoutList");
    setGroup(collection.group ?? "");
    setRevisionsOn(collection.revisionsOn);
    setDraftsOn(collection.draftsOn);
  }, [collection]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({
        label,
        icon: icon.trim() ? icon.trim() : null,
        group: group.trim() ? group.trim() : null,
        revisionsOn,
        draftsOn,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>
          Metadata about this collection. Changes apply immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <CollectionIconField
            value={icon}
            onChange={setIcon}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label>Group</Label>
          <ComboboxInput
            value={group}
            onChange={setGroup}
            disabled={disabled}
            options={groupOptions}
            placeholder="e.g. Content"
          />
          <p className="text-xs text-muted-foreground">
            Pick an existing group or type a new one.
          </p>
        </div>
        <div className="col-span-full flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={revisionsOn}
              disabled={disabled}
              onCheckedChange={(v) => setRevisionsOn(v === true)}
            />
            Track revisions
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draftsOn}
              disabled={disabled}
              onCheckedChange={(v) => setDraftsOn(v === true)}
            />
            Enable drafts
          </label>
        </div>
        {error ? (
          <p className="col-span-full text-xs text-destructive">{error}</p>
        ) : null}
        <div className="col-span-full flex justify-end">
          <Button
            onClick={handleSave}
            disabled={disabled || saving}
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
      </CardContent>
    </Card>
  );
}

function ExistingFieldsCard({
  collection,
  actionsDisabled,
  onReorderFieldKeys,
  onRemove,
}: {
  collection: CmsCollectionDto;
  actionsDisabled: boolean;
  onReorderFieldKeys?: (orderedKeys: string[]) => void;
  onRemove: (fieldKey: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    if (!onReorderFieldKeys) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = collection.fields.findIndex((f) => f.id === active.id);
    const newIndex = collection.fields.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(collection.fields, oldIndex, newIndex);
    onReorderFieldKeys(reordered.map((f) => f.key));
  };

  const fields = collection.fields;
  const count = fields.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fields</CardTitle>
        <CardDescription>
          {count} field{count === 1 ? "" : "s"}. Drag the handle to change
          display order (dynamic collections). Removing a field soft-archives the
          column.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {fields.map((field) => (
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
      </CardContent>
    </Card>
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

function AddFieldCard({
  disabled,
  existingKeys,
  onAdd,
}: {
  disabled: boolean;
  existingKeys: string[];
  onAdd: (body: AddCmsFieldRequest) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<SchemaFieldDraft>(emptyFieldDraft());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const keyError = keyHint(draft.key);
  const duplicate = existingKeys.includes(draft.key);
  const canSubmit =
    isValidKey(draft.key) &&
    !duplicate &&
    draft.label.trim().length > 0 &&
    !disabled &&
    !saving;

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
      setDraft(emptyFieldDraft());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const formId = useId();
  const labelId = `${formId}-label`;
  const keyId = `${formId}-key`;
  const typeId = `${formId}-type`;
  const keyMessage =
    keyError ?? (duplicate ? "Key already exists." : null);
  const typeHint =
    FIELD_TYPE_CHOICES.find((c) => c.type === draft.type)?.hint ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add field</CardTitle>
        <CardDescription>
          New columns are appended to the end. You cannot change an existing
          field&apos;s type—add a new field instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start">
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
                <p
                  id={`${keyId}-err`}
                  className="text-xs text-destructive"
                >
                  {keyMessage}
                </p>
              ) : null}
            </div>
          </div>
          <div className="space-y-2 lg:col-span-1">
            <Label htmlFor={typeId}>Type</Label>
            <AppSelect
              id={typeId}
              value={draft.type}
              onChange={(v) =>
                setDraft((prev) => ({
                  ...prev,
                  type: v as CmsFieldType,
                  config: {},
                }))
              }
              options={FIELD_TYPE_SELECT_OPTIONS}
              isSearchable
            />
            {typeHint ? (
              <p className="text-xs text-muted-foreground leading-snug">
                {typeHint}
              </p>
            ) : (
              <div className="min-h-[1.25rem]" aria-hidden />
            )}
          </div>
        </div>

        <Separator />

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
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
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
      </CardFooter>
    </Card>
  );
}
