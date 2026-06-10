
import { Bell } from "lucide-react";
import { buttonVariants } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown_menu";
import { cn } from "~/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  description: string;
  time: string;
  unread?: boolean;
};

const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "1",
    title: "New comment on post",
    description: "Alex left a comment on “Getting Started with Next.js 16”.",
    time: "2 min ago",
    unread: true,
  },
  {
    id: "2",
    title: "Draft published",
    description: "“Tailwind CSS v4 Deep Dive” is now live.",
    time: "1 hour ago",
    unread: true,
  },
  {
    id: "3",
    title: "Storage warning",
    description: "Media library is at 82% capacity.",
    time: "Yesterday",
    unread: false,
  },
  {
    id: "4",
    title: "Weekly summary",
    description: "Your analytics report for last week is ready.",
    time: "3 days ago",
    unread: false,
  },
];

export function NotificationDropdown() {
  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => n.unread).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "relative size-10 cursor-pointer"
        )}
        aria-label="Open notifications"
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex size-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 sm:w-96" sideOffset={8}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <span className="text-xs text-muted-foreground">
            {MOCK_NOTIFICATIONS.length} total
          </span>
        </div>
        <ul
          className="max-h-72 overflow-y-auto py-1"
          role="list"
          aria-label="Notification list"
        >
          {MOCK_NOTIFICATIONS.map((n) => (
            <li
              key={n.id}
              className={cn(
                "border-b border-border/60 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/60",
                n.unread && "bg-muted/40"
              )}
            >
              <p className="text-sm font-medium leading-tight">{n.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {n.description}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{n.time}</p>
            </li>
          ))}
        </ul>
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem className="cursor-pointer justify-center text-xs font-medium">
          Mark all as read
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
