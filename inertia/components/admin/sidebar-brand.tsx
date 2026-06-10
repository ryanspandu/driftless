
import { useEffect, useState } from "react";
import { useProjectBranding } from "~/contexts/project-branding-context";

const FALLBACK_LOGO = "/logo.svg";

/** Logo in the sidebar header; falls back if URL fails to load. */
export function SidebarBrandLogo({
  className,
}: {
  className?: string;
}) {
  const {
    branding: { logoUrl, projectName },
  } = useProjectBranding();
  const [src, setSrc] = useState(logoUrl);

  useEffect(() => {
    setSrc(logoUrl);
  }, [logoUrl]);

  return (
    <img
      src={src}
      alt={projectName}
      className={className}
      onError={() => setSrc(FALLBACK_LOGO)}
    />
  );
}

export function SidebarBrandTitle() {
  const {
    branding: { projectName },
  } = useProjectBranding();
  return (
    <span className="truncate font-semibold">{projectName}</span>
  );
}

export function SidebarBrandTagline() {
  const {
    branding: { projectTagline },
  } = useProjectBranding();
  return (
    <span className="truncate text-xs text-muted-foreground">{projectTagline}</span>
  );
}
