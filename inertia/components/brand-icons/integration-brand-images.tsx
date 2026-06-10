import { cn } from "~/lib/utils";

/** Google Analytics logo (`/public/img/google-analytic.webp`). */
export function GoogleAnalyticsBrandImg({
  className,
}: {
  className?: string;
}) {
  return (
    <img
      src="/img/google-analytic.webp"
      alt=""
      width={28}
      height={28}
      className={cn("object-contain", className)}
      aria-hidden
    />
  );
}

/** Microsoft Clarity logo (`/public/img/microsoft-clarity.png`). */
export function MicrosoftClarityBrandImg({
  className,
}: {
  className?: string;
}) {
  return (
    <img
      src="/img/microsoft-clarity.png"
      alt=""
      width={28}
      height={28}
      className={cn("object-contain", className)}
      aria-hidden
    />
  );
}
