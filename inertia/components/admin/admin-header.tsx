
import { Fragment } from "react";
import { usePathname } from "~/hooks/use-inertia-url";
import { Search } from "lucide-react";
import { ThemeToggle } from "~/components/admin/theme-toggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { ConnectionIndicator } from "~/components/admin/connection-indicator";
import { NotificationDropdown } from "~/components/admin/notification-dropdown";
import { SyncCenter } from "~/components/admin/sync-center";
import { UserAccountDropdown } from "~/components/admin/user-account-dropdown";

const PAGE_LABELS: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/content": "Content",
  "/admin/media": "Media",
  "/admin/users": "Users",
  "/admin/roles": "Roles & Permissions",
  "/admin/analytics": "Analytics",
  "/admin/forms": "Forms",
  "/admin/redirects": "Redirects",
  "/admin/settings": "Website settings",
  "/admin/profile": "Profile",
  "/admin/integrations": "Integrations",
  "/admin/integrations/google": "Google sign-in",
  "/admin/integrations/captcha": "CAPTCHA",
  "/admin/integrations/google-analytics": "Google Analytics",
  "/admin/integrations/clarity": "Microsoft Clarity",
};

function headerLabel(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
  if (pathname.startsWith("/admin/integrations/")) {
    if (pathname.includes("/google-analytics")) return "Google Analytics";
    if (pathname.includes("/clarity")) return "Microsoft Clarity";
    if (pathname.includes("/google")) return "Google sign-in";
    if (pathname.includes("/captcha")) return "CAPTCHA";
    return "Integrations";
  }
  return "Admin";
}

/** Breadcrumb for `/admin/integrations` and nested integration screens. */
function integrationsBreadcrumbItems(pathname: string): {
  segments: { href?: string; label: string }[];
} | null {
  if (!pathname.startsWith("/admin/integrations")) return null;
  if (pathname === "/admin/integrations") {
    return {
      segments: [{ label: "Integrations" }],
    };
  }
  const detail = integrationDetailLabel(pathname);
  return {
    segments: [
      { href: "/admin/integrations", label: "Integrations" },
      { label: detail },
    ],
  };
}

function integrationDetailLabel(pathname: string): string {
  if (pathname.includes("/google-analytics")) return "Google Analytics";
  if (pathname.includes("/clarity")) return "Microsoft Clarity";
  if (pathname.includes("/google")) return "Google sign-in";
  if (pathname.includes("/captcha")) return "CAPTCHA";
  return "Integration";
}

export function AdminHeader() {
  const pathname = usePathname();
  const label = headerLabel(pathname);
  const integrationCrumbs = integrationsBreadcrumbItems(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />

      <Separator orientation="vertical" className="mr-2 h-4!" />

      <Breadcrumb className="hidden min-w-0 flex-1 md:flex">
        <BreadcrumbList>
          {integrationCrumbs ? (
            <>
              {integrationCrumbs.segments.map((seg, i) => {
                const isLast = i === integrationCrumbs.segments.length - 1;
                return (
                  <Fragment key={`${seg.label}-${i}`}>
                    {i > 0 ? <BreadcrumbSeparator /> : null}
                    <BreadcrumbItem className="min-w-0">
                      {isLast || !seg.href ? (
                        <BreadcrumbPage className="truncate">
                          {seg.label}
                        </BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={seg.href} className="truncate">
                          {seg.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </Fragment>
                );
              })}
            </>
          ) : (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink href="/admin/dashboard">Pages</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{label}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        <SyncCenter />
        <ConnectionIndicator />
        <div className="relative hidden lg:block">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="h-9 w-64 pl-8 text-sm"
          />
        </div>
        <NotificationDropdown />
        <ThemeToggle />
        <UserAccountDropdown />
      </div>
    </header>
  );
}
