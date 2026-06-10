
import { FormEvent, useState } from "react";
import type {
  CmsCollectionDto,
  CmsRecordDto,
  ContentStatus,
} from "~/types/api";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { AppSelect } from "~/components/ui/app-select";
import { FieldRenderer } from "~/components/cms/field-renderer";
import { apiErrorMessage } from "~/lib/api";

export interface RecordFormValue {
  status: ContentStatus;
  data: Record<string, unknown>;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Hide row-level status field when the collection uses the draft/publish control. */
function formFields(collection: CmsCollectionDto) {
  return collection.fields.filter(
    (f) => !(collection.draftsOn && f.key === "status"),
  );
}

function prepareSubmitPayload(
  collection: CmsCollectionDto,
  data: Record<string, unknown>,
  status: ContentStatus,
): RecordFormValue {
  const out = { ...data };

  for (const field of collection.fields) {
    if (collection.draftsOn && field.key === "status") {
      delete out.status;
      continue;
    }
    if (field.type === "SLUG" || field.key === "slug") {
      const raw = out[field.key];
      const str = typeof raw === "string" ? raw.trim() : "";
      if (!str) {
        const sourceKey = String(field.config?.source ?? "title");
        const source = out[sourceKey];
        if (typeof source === "string" && source.trim()) {
          out[field.key] = slugify(source);
        }
      } else {
        out[field.key] = slugify(str);
      }
    }
  }

  return { status, data: out };
}

export interface RecordFormProps {
  collection: CmsCollectionDto;
  /** Initial value — pass the existing record for edit, or `undefined` for create. */
  initial?: CmsRecordDto | null;
  onSubmit: (value: RecordFormValue) => Promise<void>;
  onCancel?: () => void;
  /** Text for the submit button (defaults to "Save"). */
  submitLabel?: string;
  /** Extra actions rendered next to the submit button (e.g. Delete). */
  extraActions?: React.ReactNode;
}

/**
 * Shared record form used by the dedicated create/edit pages. Keeps its own
 * internal draft state — parent pages remount it on route change so there is
 * no need to externalize that state. Submits through the async `onSubmit`
 * callback and surfaces any thrown error inline.
 */
export function RecordForm({
  collection,
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  extraActions,
}: RecordFormProps) {
  const [data, setData] = useState<Record<string, unknown>>(
    () => initial?.data ?? {},
  );
  const [status, setStatus] = useState<ContentStatus>(
    () => initial?.status ?? "DRAFT",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (fieldKey: string, value: unknown) => {
    setData((prev) => ({ ...prev, [fieldKey]: value }));
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(prepareSubmitPayload(collection, data, status));
    } catch (e) {
      setError(apiErrorMessage(e, "Failed to save"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {collection.draftsOn ? (
        <div className="space-y-1 md:max-w-xs">
          <Label>Status</Label>
          <AppSelect
            value={status}
            onChange={(v) => setStatus(v as ContentStatus)}
            options={[
              { value: "DRAFT", label: "Draft" },
              { value: "PUBLISHED", label: "Published" },
            ]}
            isSearchable={false}
          />
        </div>
      ) : null}

      <div className="grid gap-6">
        {formFields(collection).map((field) => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={data[field.key]}
            onChange={(v) => handleChange(field.key, v)}
            disabled={submitting}
          />
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {extraActions}
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
