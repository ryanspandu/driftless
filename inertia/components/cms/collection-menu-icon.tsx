
import { createElement } from "react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  isCustomCollectionIcon,
  resolveCollectionLucideIcon,
} from "~/components/cms/collection-icon-lucide";

function lucideFromName(name: string): LucideIcon {
  const candidate = (LucideIcons as unknown as Record<string, LucideIcon | undefined>)[name];
  if (typeof candidate === "function") return candidate;
  return resolveCollectionLucideIcon(name);
}

type Props = {
  icon: string | null | undefined;
  className?: string;
};

/**
 * Renders a CMS collection icon in the admin sidebar: data URL / http(s) image,
 * Lucide preset name, or fallback.
 */
export function CollectionMenuIcon({ icon, className }: Props) {
  const cn = className ?? "size-4 shrink-0";
  const raw = icon?.trim();
  if (!raw) {
    return createElement(LucideIcons.LayoutList, { className: cn });
  }
  if (isCustomCollectionIcon(raw)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user-provided data URL or external URL
      <img
        src={raw}
        alt=""
        className={`${cn} rounded object-contain`}
      />
    );
  }
  return createElement(lucideFromName(raw), { className: cn });
}
