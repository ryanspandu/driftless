import { Link } from '@inertiajs/react'
import { KeyRound, Plug2, Shield } from 'lucide-react'
import { FcGoogle } from 'react-icons/fc'
import {
  GoogleAnalyticsBrandImg,
  MicrosoftClarityBrandImg,
} from '~/components/brand-icons/integration-brand-images'
import { Button } from '~/components/ui/button'
import { BackButton } from '~/components/admin/back-button'
import { IntegrationHubCard } from '~/components/admin/integration-hub-card'
import { Can } from '~/components/providers/ability-provider'
import { useIntegrationSettings } from '~/hooks/api/use-integration-settings'
import { cn } from '~/lib/utils'

export default function IntegrationsIndexPage() {
  const query = useIntegrationSettings()

  const googleOn =
    query.data?.googleAuthEnabled &&
    Boolean((query.data.googleClientId?.trim() ?? '') || query.data.envGoogleOAuthFallback)
  const captchaOn =
    query.data?.captchaEnabled &&
    Boolean((query.data.captchaSiteKey?.trim() ?? '') || query.data.envCaptchaFallback)
  const gaOn =
    query.data?.ga4Enabled &&
    Boolean((query.data.ga4MeasurementId?.trim() ?? '') || query.data.envGa4Fallback)
  const clarityOn =
    query.data?.clarityEnabled &&
    Boolean((query.data.clarityProjectId?.trim() ?? '') || query.data.envClarityFallback)

  return (
    <Can permission="settings:manage" fallback={<NoAccess />}>
      <div className="space-y-8">
        <div className="flex items-center gap-3">
          <BackButton href="/admin/dashboard" label="Back to dashboard" />
          <div className="flex items-center gap-2">
            <Plug2 className="size-6 text-muted-foreground" aria-hidden />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
              <p className="text-sm text-muted-foreground">
                Connect sign-in, bot protection, and analytics trackers. Choose a service to
                configure keys and toggles.
              </p>
            </div>
          </div>
        </div>

        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive">{(query.error as Error).message}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <li>
              <IntegrationHubCard
                href="/admin/integrations/google"
                title="Google sign-in"
                description="Let users sign in with their Google account using OAuth 2.0."
                icon={GoogleTileIcon}
                status={googleOn ? 'Enabled' : 'Off'}
                statusVariant={googleOn ? 'success' : 'muted'}
              />
            </li>
            <li>
              <IntegrationHubCard
                href="/admin/integrations/captcha"
                title="CAPTCHA"
                description="Turnstile, hCaptcha, or Google reCAPTCHA on login and registration."
                icon={Shield}
                status={captchaOn ? 'On' : 'Off'}
                statusVariant={captchaOn ? 'success' : 'muted'}
              />
            </li>
            <li>
              <IntegrationHubCard
                href="/admin/integrations/google-analytics"
                title="Google Analytics"
                description="GA4 measurement ID for page views and events on this site."
                icon={GaTileIcon}
                status={gaOn ? 'On' : 'Off'}
                statusVariant={gaOn ? 'success' : 'muted'}
              />
            </li>
            <li>
              <IntegrationHubCard
                href="/admin/integrations/clarity"
                title="Microsoft Clarity"
                description="Session replay and heatmaps via the Clarity script."
                icon={ClarityTileIcon}
                status={clarityOn ? 'On' : 'Off'}
                statusVariant={clarityOn ? 'success' : 'muted'}
              />
            </li>
            <li>
              <IntegrationHubCard
                href="/admin/integrations/api-tokens"
                title="API Tokens"
                description="Personal Access Tokens for the external /api/v1 API."
                icon={KeyRound}
                status="Manage"
                statusVariant="muted"
              />
            </li>
          </ul>
        )}
      </div>
    </Can>
  )
}

function GoogleTileIcon({ className }: { className?: string }) {
  return <FcGoogle className={cn('size-7', className)} aria-hidden />
}

function GaTileIcon({ className }: { className?: string }) {
  return <GoogleAnalyticsBrandImg className={cn('size-7', className)} />
}

function ClarityTileIcon({ className }: { className?: string }) {
  return <MicrosoftClarityBrandImg className={cn('size-7', className)} />
}

function NoAccess() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
      <p className="text-sm text-muted-foreground">
        You need the <code className="rounded bg-muted px-1">settings:manage</code> permission to
        configure integrations.
      </p>
      <Button variant="outline" render={<Link href="/admin/dashboard" />}>
        Back to dashboard
      </Button>
    </div>
  )
}
