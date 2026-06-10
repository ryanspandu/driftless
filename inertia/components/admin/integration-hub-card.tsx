import { Link } from "@inertiajs/react";
import type { ComponentType } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "~/lib/utils";

interface Props {
  href: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  /** Short status, e.g. "On" / "Off" / "Not set" */
  status?: string;
  statusVariant?: "muted" | "success" | "warning";
}

export function IntegrationHubCard({
  href,
  title,
  description,
  icon: Icon,
  status,
  statusVariant = "muted",
}: Props) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all",
        "hover:border-ring/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      )}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-foreground transition-colors group-hover:bg-muted/80">
        <Icon className="size-7" aria-hidden />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {status ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                statusVariant === "success" &&
                  "bg-green-500/15 text-green-700 dark:text-green-400",
                statusVariant === "warning" &&
                  "bg-amber-500/15 text-amber-800 dark:text-amber-400",
                statusVariant === "muted" &&
                  "bg-muted text-muted-foreground",
              )}
            >
              {status}
            </span>
          ) : null}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="mt-4 flex items-center text-sm font-medium text-ring">
        <span>Configure</span>
        <ChevronRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
