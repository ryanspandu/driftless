import { createContext, useContext, useMemo } from 'react'
import { useWebsiteSettings } from '~/hooks/api/use-website-settings'

export type ProjectBranding = {
  projectName: string
  projectTagline: string
  logoUrl: string
}

const DEFAULT_BRANDING: ProjectBranding = {
  projectName: 'Driftless',
  projectTagline: 'CMS Admin',
  logoUrl: '/logo.svg',
}

type Ctx = {
  branding: ProjectBranding
  isLoading: boolean
}

const ProjectBrandingContext = createContext<Ctx | null>(null)

function readAdminBranding(sections: Record<string, Record<string, string>> | undefined): ProjectBranding {
  const ab = sections?.admin_branding
  if (!ab) return DEFAULT_BRANDING
  return {
    projectName: ab.project_name?.trim() || DEFAULT_BRANDING.projectName,
    projectTagline: ab.project_tagline?.trim() || DEFAULT_BRANDING.projectTagline,
    logoUrl: ab.logo_url?.trim() || DEFAULT_BRANDING.logoUrl,
  }
}

export function ProjectBrandingProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending, isError } = useWebsiteSettings()

  const branding = useMemo(() => {
    if (!data || isError) return DEFAULT_BRANDING
    return readAdminBranding(data.sections)
  }, [data, isError])

  const value = useMemo(() => ({ branding, isLoading: isPending }), [branding, isPending])

  return <ProjectBrandingContext.Provider value={value}>{children}</ProjectBrandingContext.Provider>
}

export function useProjectBranding() {
  const ctx = useContext(ProjectBrandingContext)
  if (!ctx) {
    throw new Error('useProjectBranding must be used within ProjectBrandingProvider')
  }
  return ctx
}
