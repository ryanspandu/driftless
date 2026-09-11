
import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PermissionDto, RoleDto } from "~/types/api";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { PermissionPicker } from "./permission-picker";

export interface RoleFormValue {
  name: string;
  description: string | null;
  permissions: string[];
}

interface Props {
  mode: "create" | "edit";
  initial?: RoleDto | null;
  allPermissions: PermissionDto[];
  onSubmit: (value: RoleFormValue) => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
}

export function RoleForm({
  mode,
  initial,
  allPermissions,
  onSubmit,
  onCancel,
  submitting,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(
    initial?.permissions ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  const isSuperadmin = initial?.name === "SUPERADMIN";
  const required = isSuperadmin ? ["*"] : [];

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
        permissions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  return (
    <form onSubmit={handle} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="role-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={initial?.isSystem}
            placeholder="Editor"
          />
          {initial?.isSystem ? (
            <p className="text-xs text-muted-foreground">
              Built-in role — name cannot be changed.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="role-description">Description</Label>
          <Textarea
            id="role-description"
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Short summary of what this role can do."
          />
        </div>
      </div>

      <PermissionPicker
        all={allPermissions}
        selected={permissions}
        onChange={setPermissions}
        required={required}
      />

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
          {mode === "create" ? "Create role" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
