import { Link } from "@inertiajs/react";
import { History, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { CmsCollectionDto, CmsRecordDto } from "~/types/api";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown_menu";
import { useAbility } from "~/components/providers/ability-provider";

export function cmsRecordEditPath(collectionKey: string, recordId: string): string {
  return `/admin/cms/${encodeURIComponent(collectionKey)}/${encodeURIComponent(recordId)}`;
}

export function cmsRecordListPath(collectionKey: string): string {
  return `/admin/cms/${encodeURIComponent(collectionKey)}`;
}

export function cmsRecordLabel(record: CmsRecordDto, _collection: CmsCollectionDto): string {
  const title = record.data.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const slug = record.data.slug;
  if (typeof slug === "string" && slug.trim()) return slug.trim();
  const email = record.data.email;
  if (typeof email === "string" && email.trim()) return email.trim();
  const filename = record.data.filename;
  if (typeof filename === "string" && filename.trim()) return filename.trim();
  return record.id;
}

interface CmsRecordActionsProps {
  collection: CmsCollectionDto;
  record: CmsRecordDto;
  onDelete: () => void;
  onRevisions?: () => void;
  /**
   * When set, edit opens the same way as create on this screen (modal), not a
   * separate page. Used when add does not navigate (e.g. future inline flows).
   */
  onEdit?: () => void;
}

/**
 * Edit / delete controls for CMS record rows. Respects per-collection CMS
 * permissions and blocks user-record mutations (native Users collection).
 */
export function CmsRecordActions({
  collection,
  record,
  onDelete,
  onRevisions,
  onEdit,
}: CmsRecordActionsProps) {
  const { permissions } = useAbility();
  const key = collection.key;
  const isUserCollection = collection.source === "PRISMA" && key === "user";

  const canUpdate =
    !isUserCollection && permissions.canCms("update", key);
  const canDelete =
    !isUserCollection && permissions.canCms("delete", key);
  const canRead = permissions.canCms("read", key);
  const editHref = cmsRecordEditPath(key, record.id);
  const usersAdminHref = "/admin/users";

  if (!canRead && !canUpdate && !canDelete) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const editLink = isUserCollection ? usersAdminHref : editHref;
  const editLabel = isUserCollection ? "Manage in Users" : "Edit";
  const usePageEdit = onEdit === undefined;

  return (
    <div className="flex items-center justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Row actions"
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canRead || canUpdate ? (
            usePageEdit ? (
              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                render={<Link href={editLink} />}
              >
                <Pencil className="size-4" />
                {editLabel}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="gap-2 cursor-pointer"
                onClick={onEdit}
              >
                <Pencil className="size-4" />
                {editLabel}
              </DropdownMenuItem>
            )
          ) : null}
          {collection.revisionsOn && onRevisions ? (
            <DropdownMenuItem
              className="gap-2 cursor-pointer"
              onClick={onRevisions}
            >
              <History className="size-4" />
              Revisions
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem
              variant="destructive"
              className="gap-2 cursor-pointer"
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          ) : null}
          {isUserCollection ? (
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              User records are managed under Admin → Users
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
