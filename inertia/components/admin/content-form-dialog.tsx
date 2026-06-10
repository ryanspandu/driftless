
import { FormEvent, useEffect, useState } from "react";
import type { ContentDto } from "~/types/api";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { AppSelect } from "~/components/ui/app-select";
import { apiErrorMessage } from "~/lib/api";

type Mode = { kind: "create" } | { kind: "edit"; row: ContentDto };

export type ContentFormSubmit = (values: {
  title: string;
  slug: string;
  body: string;
  status: "DRAFT" | "PUBLISHED";
}) => Promise<void> | void;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  onSubmit: ContentFormSubmit;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function ContentFormDialog({ open, onOpenChange, mode, onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">("DRAFT");
  const [slugDirty, setSlugDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modeKey =
    mode.kind === "edit" ? `edit:${mode.row.id}` : "create";

  useEffect(() => {
    if (!open) return;
    if (mode.kind === "edit") {
      setTitle(mode.row.title);
      setSlug(mode.row.slug);
      setBody(mode.row.body);
      setStatus(mode.row.status);
      setSlugDirty(true);
    } else {
      setTitle("");
      setSlug("");
      setBody("");
      setStatus("DRAFT");
      setSlugDirty(false);
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modeKey]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        slug: slug.trim() || slugify(title),
        body,
        status,
      });
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode.kind === "edit" ? "Edit content" : "New content"}
          </DialogTitle>
          <DialogDescription>
            {mode.kind === "edit"
              ? "Update this post. Changes sync in the background."
              : "Drafts save immediately and sync when the connection is available."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content-title">Title</Label>
            <Input
              id="content-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugDirty) setSlug(slugify(e.target.value));
              }}
              required
              minLength={1}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-slug">Slug</Label>
            <Input
              id="content-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugDirty(true);
              }}
              required
              minLength={1}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-body">Body</Label>
            <textarea
              id="content-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-status">Status</Label>
            <AppSelect
              id="content-status"
              value={status}
              onChange={(v) => setStatus(v as "DRAFT" | "PUBLISHED")}
              options={[
                { value: "DRAFT", label: "Draft" },
                { value: "PUBLISHED", label: "Published" },
              ]}
              isSearchable={false}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving…"
                : mode.kind === "edit"
                  ? "Save changes"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
