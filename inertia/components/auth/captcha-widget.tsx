import { lazy, Suspense } from "react";
import { useTheme } from "next-themes";
import type { CaptchaProviderId } from "~/types/api";

const Turnstile = lazy(() =>
  import("@marsidev/react-turnstile").then((m) => ({ default: m.Turnstile }))
);
const HCaptcha = lazy(() => import("@hcaptcha/react-hcaptcha"));
const ReCAPTCHA = lazy(() => import("react-google-recaptcha"));

function CaptchaLoading() {
  return (
    <p className="text-center text-xs text-muted-foreground">Loading captcha…</p>
  );
}

interface Props {
  provider: CaptchaProviderId;
  siteKey: string;
  onToken: (token: string | null) => void;
}

/**
 * Renders the correct client widget for the provider chosen in Admin → Integrations.
 */
export function CaptchaWidget({ provider, siteKey, onToken }: Props) {
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  if (provider === "turnstile") {
    return (
      <div className="flex justify-center">
        <Suspense fallback={<CaptchaLoading />}>
          <Turnstile
            siteKey={siteKey}
            options={{ theme }}
            onSuccess={(token) => onToken(token)}
            onExpire={() => onToken(null)}
            onError={() => onToken(null)}
          />
        </Suspense>
      </div>
    );
  }

  if (provider === "hcaptcha") {
    return (
      <div className="flex justify-center">
        <Suspense fallback={<CaptchaLoading />}>
          <HCaptcha
            sitekey={siteKey}
            theme={theme}
            onVerify={(token) => onToken(token)}
            onExpire={() => onToken(null)}
            onError={() => onToken(null)}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <Suspense fallback={<CaptchaLoading />}>
        <ReCAPTCHA
          sitekey={siteKey}
          theme={theme}
          onChange={(token) => onToken(token ?? null)}
          onExpired={() => onToken(null)}
        />
      </Suspense>
    </div>
  );
}
