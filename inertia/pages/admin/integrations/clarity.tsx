
import { Link } from "@inertiajs/react";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { MicrosoftClarityBrandImg } from "~/components/brand-icons/integration-brand-images";
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
import { Switch } from "~/components/ui/switch";
import { Can } from "~/components/providers/ability-provider";
import {
  useIntegrationSettings,
  useUpdateIntegrationSettings,
} from "~/hooks/api/use-integration-settings";

export default function ClarityIntegrationPage() {
  
  const query = useIntegrationSettings( );
  const update = useUpdateIntegrationSettings( );

  const [clarityEnabled, setClarityEnabled] = useState(false);
  const [clarityProjectId, setClarityProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    const d = query.data;
    setClarityEnabled(d.clarityEnabled);
    setClarityProjectId(d.clarityProjectId ?? "");
  }, [query.data]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        clarityEnabled,
        clarityProjectId: clarityProjectId.trim() || null,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <Can permission="settings:manage" fallback={<NoAccess />}>
      <div className="w-full max-w-none space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            render={
              <Link href="/admin/integrations" aria-label="Back to integrations" />
            }
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <MicrosoftClarityBrandImg className="size-7" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Microsoft Clarity
              </h1>
              <p className="text-sm text-muted-foreground">
                Session recordings and heatmaps for this site.
              </p>
            </div>
          </div>
        </div>

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive">
            {(query.error as Error).message}
          </p>
        ) : (
          <form className="space-y-6" onSubmit={onSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Project ID</CardTitle>
                <CardDescription>
                  From{" "}
                  <a
                    href="https://clarity.microsoft.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ring underline underline-offset-2"
                  >
                    clarity.microsoft.com
                  </a>{" "}
                  → your project → Settings. You can also set{" "}
                  <code className="rounded bg-muted px-1 text-xs">
                    CLARITY_PROJECT_ID
                  </code>{" "}
                  on the API server when the DB field is empty.
                  {query.data?.envClarityFallback ? (
                    <span className="mt-2 block text-xs text-amber-600 dark:text-amber-500">
                      Environment supplies a project ID; DB value overrides when
                      set.
                    </span>
                  ) : null}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clarityEnabled" className="font-normal">
                    Enable Microsoft Clarity
                  </Label>
                  <Switch
                    id="clarityEnabled"
                    checked={clarityEnabled}
                    onCheckedChange={(v) => setClarityEnabled(v)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clarityProjectId">Project ID</Label>
                  <Input
                    id="clarityProjectId"
                    value={clarityProjectId}
                    onChange={(e) => setClarityProjectId(e.target.value)}
                    autoComplete="off"
                    placeholder="xxxxxxxxxx"
                    className="font-mono text-sm"
                    disabled={!clarityEnabled}
                  />
                </div>
              </CardContent>
            </Card>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            {saved ? (
              <p className="text-sm text-green-600 dark:text-green-500">
                Clarity settings saved.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                render={<Link href="/admin/integrations" />}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </Can>
  );
}

function NoAccess() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Microsoft Clarity</h1>
      <p className="text-sm text-muted-foreground">
        You need <code className="rounded bg-muted px-1">settings:manage</code>.
      </p>
      <Button variant="outline" render={<Link href="/admin/dashboard" />}>
        Back to dashboard
      </Button>
    </div>
  );
}
