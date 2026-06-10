
import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PermissionDto } from "~/types/api";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

export interface PermissionFormValue {
  name: string;
  description: string | null;
}

interface Props {
  mode: "create" | "edit";
  initial?: PermissionDto | null;
  onSubmit: (value: PermissionFormValue) => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
}

export function PermissionForm({
  mode,
  initial,
  onSubmit,
  onCancel,
  submitting,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  const nameLocked = initial?.isSystem ?? false;

  async function handle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="perm-name">
          Code <span className="text-destructive">*</span>
        </Label>
        <Input
          id="perm-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={nameLocked}
          placeholder="report:export"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Use <code>resource:action</code> syntax (e.g. <code>report:export</code>).
          <code>*</code> is reserved for the superadmin wildcard.
        </p>
        {nameLocked ? (
          <p className="text-xs text-muted-foreground">
            System permission — code cannot be changed.
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="perm-description">Description</Label>
        <Textarea
          id="perm-description"
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What this permission unlocks."
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
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
        <Button type="submit" disabled={submitting} className="gap-2">
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === "create" ? "Create permission" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
