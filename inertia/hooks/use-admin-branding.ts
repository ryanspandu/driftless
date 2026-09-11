import { useWebsiteSettings } from '~/hooks/api/use-website-settings'

export interface AdminBranding {
  projectName: string
  projectTagline: string
  logoUrl: string
}

/**
 * Name, tagline and logo for the admin shell.
 *
 * These are **admin-panel** identity, deliberately separate from
 * `site_meta.site_title`, which is the public website's name. One installation
 * can be "Acme CMS" to its operators and "Acme Store" to its visitors.
 *
 * A plain hook rather than the context + provider this used to be: TanStack
 * Query already caches and dedupes `useWebsiteSettings`, so the provider only
 * existed to solve a problem the query layer had already solved — and it threw
 * when unmounted, which meant the sidebar could not use it without the whole
 * app being wrapped. Nothing ever wrapped it, which is why the settings card
 * that writes these values changed nothing on screen for as long as it existed.
 */
const DEFAULTS: AdminBranding = {
  projectName: 'Driftless',
  projectTagline: 'Admin panel',
  logoUrl: '',
}

export function useAdminBranding(): AdminBranding {
  const { data, isError } = useWebsiteSettings()
  if (isError) return DEFAULTS

  const section = data?.sections?.admin_branding
  return {
    projectName: section?.project_name?.trim() || DEFAULTS.projectName,
    projectTagline: section?.project_tagline?.trim() || DEFAULTS.projectTagline,
    /**
     * Empty means "no logo, use the initial badge" rather than `/logo.svg`.
     * The badge is what the sidebar has always shown, and defaulting to a file
     * would make "I cleared the logo" look like a broken image.
     */
    logoUrl: section?.logo_url?.trim() || DEFAULTS.logoUrl,
  }
}
