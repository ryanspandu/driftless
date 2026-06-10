
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, Sparkles, Loader2 } from "lucide-react";
import type {
  CreateUserRequest,
  RoleDto,
  UpdateUserRequest,
  UserPublic,
  UserStatus,
} from "~/types/api";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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

type Mode =
  | { kind: "create" }
  | { kind: "edit"; row: UserPublic };

export interface UserFormSubmit {
  (input:
    | { mode: "create"; body: CreateUserRequest }
    | { mode: "edit"; id: string; body: UpdateUserRequest }
  ): Promise<void>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  onSubmit: UserFormSubmit;
  generatePassword: () => Promise<string>;
  /** Available roles fetched from `GET /roles`. */
  roles: RoleDto[];
  rolesLoading?: boolean;
}

export function UserFormDialog({
  open,
  onOpenChange,
  mode,
  onSubmit,
  generatePassword,
  roles: availableRoles,
  rolesLoading,
}: Props) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [roles, setRoles] = useState<string[]>(["USER"]);
  const [status, setStatus] = useState<UserStatus>("ACTIVE");
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Stable key so parent re-renders (e.g. React Query) don't reset the form. */
  const modeKey =
    mode.kind === "edit" ? `edit:${mode.row.id}` : "create";

  useEffect(() => {
    if (!open) return;
    if (mode.kind === "edit") {
      setEmail(mode.row.email);
      setUsername(mode.row.username);
      setFirstName(mode.row.firstName);
      setLastName(mode.row.lastName ?? "");
      setPassword("");
      setRoles([...mode.row.roles]);
      setStatus(mode.row.status);
    } else {
      setEmail("");
      setUsername("");
      setFirstName("");
      setLastName("");
      setPassword("");
      setRoles(defaultRoleForCreate(availableRoles));
      setStatus("ACTIVE");
    }
    setShowPassword(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modeKey]);

  function toggleRole(name: string, checked: boolean | "indeterminate") {
    setRoles((prev) => {
      const has = prev.includes(name);
      if (checked && !has) return [...prev, name];
      if (!checked && has) return prev.filter((x) => x !== name);
      return prev;
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const pw = await generatePassword();
      setPassword(pw);
      setShowPassword(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate password");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (roles.length === 0) {
      setError("Select at least one role");
      return;
    }
    setSubmitting(true);
    try {
      if (mode.kind === "create") {
        await onSubmit({
          mode: "create",
          body: {
            email: email.trim(),
            username: username.trim(),
            firstName: firstName.trim(),
            lastName: lastName.trim() || null,
            password,
            roles,
            status,
          },
        });
      } else {
        const body: UpdateUserRequest = {
          email: email.trim() !== mode.row.email ? email.trim() : undefined,
          username: username.trim() !== mode.row.username ? username.trim() : undefined,
          firstName: firstName.trim() !== mode.row.firstName ? firstName.trim() : undefined,
          lastName:
            (lastName.trim() || null) !== mode.row.lastName
              ? lastName.trim() || null
              : undefined,
          password: password ? password : undefined,
          roles: sameRoles(roles, mode.row.roles) ? undefined : roles,
          status: status !== mode.row.status ? status : undefined,
        };
        await onSubmit({ mode: "edit", id: mode.row.id, body });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  const passwordRequired = mode.kind === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode.kind === "edit" ? "Edit user" : "Add user"}
          </DialogTitle>
          <DialogDescription>
            {mode.kind === "edit"
              ? "Update profile, roles, or reset the password."
              : "Create a new admin account. Use the generator for a strong password."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="user-username">Username</Label>
              <Input
                id="user-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-first-name">First name</Label>
              <Input
                id="user-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                minLength={1}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-last-name">Last name</Label>
              <Input
                id="user-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="user-password">
                Password{" "}
                {passwordRequired ? null : (
                  <span className="font-normal text-muted-foreground">
                    (leave blank to keep current)
                  </span>
                )}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
                className="gap-1.5"
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                Generate
              </Button>
            </div>
            <div className="relative">
              <Input
                id="user-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={passwordRequired}
                minLength={passwordRequired ? 8 : undefined}
                className="pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Roles</Label>
            {rolesLoading ? (
              <p className="text-xs text-muted-foreground">Loading roles…</p>
            ) : availableRoles.length === 0 ? (
              <p className="text-xs text-destructive">
                No roles available. Create a role first.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {availableRoles.map((r) => {
                  const checked = roles.includes(r.name);
                  return (
                    <label
                      key={r.id}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleRole(r.name, v)}
                        />
                        {r.name}
                      </span>
                      {r.isSystem ? (
                        <Badge variant="outline" className="h-4 px-1 text-[10px]">
                          system
                        </Badge>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-status">Status</Label>
            <AppSelect
              id="user-status"
              value={status}
              onChange={(v) => setStatus(v as UserStatus)}
              options={[
                { value: "ACTIVE", label: "Active" },
                { value: "INACTIVE", label: "Inactive" },
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
                  : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function defaultRoleForCreate(roles: RoleDto[]): string[] {
  const preferred = ["USER", "ADMIN"];
  for (const name of preferred) {
    if (roles.some((r) => r.name === name)) return [name];
  }
  return roles[0] ? [roles[0].name] : [];
}

function sameRoles(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}
