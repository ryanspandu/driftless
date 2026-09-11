
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { PermissionDto } from "~/types/api";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

interface Props {
  all: PermissionDto[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Permissions that must stay selected (e.g. "*" for SUPERADMIN). */
  required?: string[];
  /** Prevent selection changes (for readonly view). */
  disabled?: boolean;
}

/**
 * Grouped permission picker. Groups permissions by the first segment of
 * their code (e.g. `content:*` → "content", `cms:posts:*` → "cms:posts").
 * `*` (wildcard) is shown as its own group at the top.
 */
export function PermissionPicker({
  all,
  selected,
  onChange,
  required = [],
  disabled = false,
}: Props) {
  const [filter, setFilter] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const requiredSet = useMemo(() => new Set(required), [required]);

  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.description ?? "").toLowerCase().includes(term),
    );
  }, [all, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionDto[]>();
    for (const p of filtered) {
      const group = permissionGroup(p.name);
      const arr = map.get(group) ?? [];
      arr.push(p);
      map.set(group, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...map.entries()].sort(([a], [b]) => groupOrder(a, b));
  }, [filtered]);

  function toggle(name: string, checked: boolean) {
    if (disabled) return;
    if (requiredSet.has(name) && !checked) return;
    const next = new Set(selectedSet);
    if (checked) next.add(name);
    else next.delete(name);
    onChange([...next]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-medium">Permissions</Label>
        <span className="text-xs text-muted-foreground">
          {selected.length} of {all.length} selected
        </span>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter permissions (e.g. cms:posts)…"
          className="h-9 pl-8"
        />
      </div>

      <div className="max-h-[460px] space-y-4 overflow-y-auto rounded-md border p-3">
        {groups.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">
            No permissions match.
          </p>
        ) : null}
        {groups.map(([group, perms]) => (
          <div key={group} className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {groupLabel(group)}
              </h4>
              <span className="text-xs text-muted-foreground">
                ({perms.length})
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {perms.map((p) => {
                const checked = selectedSet.has(p.name);
                const isRequired = requiredSet.has(p.name);
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border border-input px-3 py-2 text-sm transition-colors ${
                      checked
                        ? "border-primary/40 bg-primary/5"
                        : "hover:bg-accent"
                    } ${disabled || isRequired ? "cursor-not-allowed opacity-80" : ""}`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggle(p.name, Boolean(v))}
                      disabled={disabled || isRequired}
                      className="mt-0.5"
                    />
                    <div className="flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <code className="text-xs font-medium">{p.name}</code>
                        {p.isSystem ? (
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">
                            system
                          </Badge>
                        ) : null}
                        {isRequired ? (
                          <Badge variant="default" className="h-4 px-1 text-[10px]">
                            required
                          </Badge>
                        ) : null}
                      </div>
                      {p.description ? (
                        <p className="text-xs text-muted-foreground">
                          {p.description}
                        </p>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function permissionGroup(name: string): string {
  if (name === "*") return "*";
  const parts = name.split(":");
  if (parts[0] === "cms" && parts.length === 3) return `cms:${parts[1]}`;
  return parts[0];
}

function groupLabel(group: string): string {
  if (group === "*") return "Wildcard";
  if (group.startsWith("cms:")) return `CMS / ${group.slice(4)}`;
  return group;
}

function groupOrder(a: string, b: string): number {
  if (a === "*") return -1;
  if (b === "*") return 1;
  const aCms = a.startsWith("cms");
  const bCms = b.startsWith("cms");
  if (aCms !== bCms) return aCms ? 1 : -1;
  return a.localeCompare(b);
}
