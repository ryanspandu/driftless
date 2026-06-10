/**
 * Minimal permission matcher mirroring the backend CASL rules. We don't pull
 * CASL into the client bundle — matching is cheap string math:
 *
 *   - `*` grants everything (SUPERADMIN).
 *   - `cms:manage` grants any action on any CMS collection/record.
 *   - `cms:<key>:<verb>` grants a specific verb on a specific collection.
 *   - Legacy static permissions like `content:read`, `user:update` continue
 *     to work.
 *
 * Unknown strings are treated as literal matches.
 */

export type CmsVerb = "read" | "create" | "update" | "delete";

export class Permissions {
  constructor(private readonly granted: ReadonlySet<string>) {}

  static from(permissions: readonly string[] | null | undefined): Permissions {
    return new Permissions(new Set(permissions ?? []));
  }

  has(permission: string): boolean {
    if (this.granted.has("*")) return true;
    return this.granted.has(permission);
  }

  /** Does the user have any verb for this collection? Used for nav visibility. */
  canAccessCollection(key: string): boolean {
    if (this.granted.has("*")) return true;
    if (this.granted.has("cms:manage")) return true;
    for (const verb of ["read", "create", "update", "delete"] as const) {
      if (this.granted.has(`cms:${key}:${verb}`)) return true;
    }
    return false;
  }

  canCms(verb: CmsVerb, key: string): boolean {
    if (this.granted.has("*")) return true;
    if (this.granted.has("cms:manage")) return true;
    return this.granted.has(`cms:${key}:${verb}`);
  }

  /** Used to gate the "Manage collections" admin UI. */
  canManageCms(): boolean {
    if (this.granted.has("*")) return true;
    return this.granted.has("cms:manage");
  }
}
