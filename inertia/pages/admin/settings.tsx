
import { Link } from "@inertiajs/react";
import { FormEvent, useEffect, useState } from "react";
import { Plug2, SlidersHorizontal } from "lucide-react";
import { WEBSITE_SETTING_SECTIONS } from "~/types/api";
import { ImageSettingControl } from "~/components/admin/image-setting-control";
import { WebsiteLogoDropzone } from "~/components/admin/website-logo-dropzone";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Can, useAbility } from "~/components/providers/ability-provider";
import {
  useUpdateWebsiteSettings,
  useWebsiteSettings,
} from "~/hooks/api/use-website-settings";

const AUTH_DEFAULT_BG = "/bg-login.webp";
const AUTH_DEFAULT_LOGO = "/logo-text.svg";
const SITE_DEFAULT_FAVICON = "/logo.svg";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Website settings</h1>
        <p className="text-sm text-muted-foreground">
          Website appearance and integrations.{" "}
          <Link
            href="/admin/profile"
            className="font-medium text-ring underline-offset-4 hover:underline"
          >
            Account profile
          </Link>{" "}
          is on a separate page.
        </p>
      </div>

      <Can permission="settings:manage">
        <Tabs defaultValue="admin-sidebar" className="">
          <TabsList className="grid h-auto grid-cols-1 gap-1 sm:grid-cols-3">
            <TabsTrigger value="admin-sidebar">Admin sidebar</TabsTrigger>
            <TabsTrigger value="auth-pages">Login &amp; register</TabsTrigger>
            <TabsTrigger value="site-meta">Site &amp; SEO</TabsTrigger>
          </TabsList>

          <TabsContent value="admin-sidebar" className="mt-4">
            <AdminSidebarSection />
          </TabsContent>
          <TabsContent value="auth-pages" className="mt-4">
            <AuthPagesSection />
          </TabsContent>
          <TabsContent value="site-meta" className="mt-4">
            <SiteMetaSection />
          </TabsContent>
        </Tabs>

        <Card className="mt-6">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <Plug2 className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
            <div className="space-y-1">
              <CardTitle className="text-base">Integrations</CardTitle>
              <CardDescription>
                Google OAuth, CAPTCHA, GA4, and Microsoft Clarity.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link href="/admin/integrations" />}>
              Open integrations
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <SlidersHorizontal className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
            <div className="space-y-1">
              <CardTitle className="text-base">Application</CardTitle>
              <CardDescription>
                Public site on/off, hide sidebar menus, and enable/disable modules.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link href="/admin/settings/application" />}>
              Open application settings
            </Button>
          </CardContent>
        </Card>
      </Can>

      <SettingsDeniedCard />
    </div>
  );
}

function AdminSidebarSection() {
  
  const { data, isPending } = useWebsiteSettings( );
  const update = useUpdateWebsiteSettings( );
  const ab = data?.sections?.[WEBSITE_SETTING_SECTIONS.ADMIN_BRANDING];
  const [projectName, setProjectName] = useState("Driftless");
  const [projectTagline, setProjectTagline] = useState("CMS Admin");
  const [logoUrl, setLogoUrl] = useState("/logo.svg");
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!ab) return;
    setProjectName(ab.project_name ?? "Driftless");
    setProjectTagline(ab.project_tagline ?? "CMS Admin");
    setLogoUrl(ab.logo_url ?? "/logo.svg");
  }, [ab]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await update.mutateAsync({
        patches: [
          {
            section: WEBSITE_SETTING_SECTIONS.ADMIN_BRANDING,
            key: "project_name",
            value: projectName.trim() || "Driftless",
          },
          {
            section: WEBSITE_SETTING_SECTIONS.ADMIN_BRANDING,
            key: "project_tagline",
            value: projectTagline.trim(),
          },
          {
            section: WEBSITE_SETTING_SECTIONS.ADMIN_BRANDING,
            key: "logo_url",
            value: logoUrl.trim() || "/logo.svg",
          },
        ],
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardDescription>
            Name, tagline, and logo in the admin shell (stored as key–value rows in the
            database).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <WebsiteLogoDropzone
            value={logoUrl}
            onChange={setLogoUrl}
            disabled={isPending}
          />
          <div className="space-y-2">
            <Label htmlFor="projectName">Website name</Label>
            <Input
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Driftless"
              autoComplete="off"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectTagline">Sidebar tagline</Label>
            <Input
              id="projectTagline"
              value={projectTagline}
              onChange={(e) => setProjectTagline(e.target.value)}
              placeholder="CMS Admin"
              autoComplete="off"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Short line under the website name in the sidebar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending || update.isPending}>
              Save admin sidebar
            </Button>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-green-600 dark:text-green-500" role="status">
              Admin sidebar saved.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
  );
}

function AuthPagesSection() {
  
  const { data, isPending } = useWebsiteSettings( );
  const update = useUpdateWebsiteSettings( );
  const ap = data?.sections?.[WEBSITE_SETTING_SECTIONS.AUTH_PAGES];
  const [backgroundUrl, setBackgroundUrl] = useState(AUTH_DEFAULT_BG);
  const [logoUrl, setLogoUrl] = useState(AUTH_DEFAULT_LOGO);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!ap) return;
    setBackgroundUrl(ap.background_url ?? AUTH_DEFAULT_BG);
    setLogoUrl(ap.logo_url ?? AUTH_DEFAULT_LOGO);
  }, [ap]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await update.mutateAsync({
        patches: [
          {
            section: WEBSITE_SETTING_SECTIONS.AUTH_PAGES,
            key: "background_url",
            value: backgroundUrl.trim() || AUTH_DEFAULT_BG,
          },
          {
            section: WEBSITE_SETTING_SECTIONS.AUTH_PAGES,
            key: "logo_url",
            value: logoUrl.trim() || AUTH_DEFAULT_LOGO,
          },
        ],
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardDescription>
            Left panel on sign-in and sign-up: background image and logo. Uses the same
            layout for both pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ImageSettingControl
            label="Background image"
            value={backgroundUrl}
            onChange={setBackgroundUrl}
            defaultAsset={AUTH_DEFAULT_BG}
            resetLabel="Use default background"
            disabled={isPending}
            preview="wide"
          />
          <ImageSettingControl
            label="Panel logo"
            value={logoUrl}
            onChange={setLogoUrl}
            defaultAsset={AUTH_DEFAULT_LOGO}
            resetLabel="Use default logo"
            disabled={isPending}
            preview="square"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending || update.isPending}>
              Save login &amp; register
            </Button>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-green-600 dark:text-green-500" role="status">
              Login &amp; register appearance saved.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
  );
}

function SiteMetaSection() {
  
  const { data, isPending } = useWebsiteSettings( );
  const update = useUpdateWebsiteSettings( );
  const sm = data?.sections?.[WEBSITE_SETTING_SECTIONS.SITE_META];
  const [siteTitle, setSiteTitle] = useState("Driftless");
  const [siteDescription, setSiteDescription] = useState(
    "Driftless — a fast, modern content hub. Discover published articles and updates.",
  );
  const [faviconUrl, setFaviconUrl] = useState(SITE_DEFAULT_FAVICON);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!sm) return;
    setSiteTitle(sm.site_title ?? "Driftless");
    setSiteDescription(
      sm.site_description ??
        "Driftless — a fast, modern content hub. Discover published articles and updates.",
    );
    setFaviconUrl(sm.favicon_url ?? SITE_DEFAULT_FAVICON);
  }, [sm]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await update.mutateAsync({
        patches: [
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: "site_title",
            value: siteTitle.trim() || "Driftless",
          },
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: "site_description",
            value: siteDescription.trim(),
          },
          {
            section: WEBSITE_SETTING_SECTIONS.SITE_META,
            key: "favicon_url",
            value: faviconUrl.trim() || SITE_DEFAULT_FAVICON,
          },
        ],
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardDescription>
            Default browser title, description, and favicon. The title and favicon apply
            after load (see also static metadata in the app layout).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="siteTitle">Site title</Label>
            <Input
              id="siteTitle"
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              placeholder="Driftless"
              autoComplete="off"
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="siteDescription">Meta description</Label>
            <Textarea
              id="siteDescription"
              value={siteDescription}
              onChange={(e) => setSiteDescription(e.target.value)}
              placeholder="Short description for search and sharing."
              rows={3}
              disabled={isPending}
            />
          </div>
          <ImageSettingControl
            label="Favicon"
            value={faviconUrl}
            onChange={setFaviconUrl}
            defaultAsset={SITE_DEFAULT_FAVICON}
            resetLabel="Use default favicon"
            disabled={isPending}
            preview="square"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending || update.isPending}>
              Save site &amp; SEO
            </Button>
          </div>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-green-600 dark:text-green-500" role="status">
              Site settings saved.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </form>
  );
}

function SettingsDeniedCard() {
  const { permissions } = useAbility();
  if (permissions.has("settings:manage")) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Website settings</CardTitle>
        <CardDescription>
          You need the{" "}
          <code className="rounded bg-muted px-1 text-xs">settings:manage</code>{" "}
          permission to edit website name, logo, and integrations.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
