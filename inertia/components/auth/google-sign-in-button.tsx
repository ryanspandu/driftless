
import { FcGoogle } from "react-icons/fc";
import { Button } from "~/components/ui/button";
import { useAuthPublicConfig } from "~/hooks/api/use-auth";

export function GoogleSignInButton({ label = 'Continue with Google' }: { label?: string }) {
  const { data, isLoading } = useAuthPublicConfig()
  const configured = data?.google?.configured === true

  function startGoogle() {
    window.location.href = '/auth/google'
  }

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={isLoading || !configured}
      className="h-12 w-full gap-2 rounded-xl border border-border bg-muted/60 text-base font-medium text-foreground shadow-none"
      title={
        !configured
          ? "Enable Google in Admin → Integrations (or set API env vars)"
          : undefined
      }
      onClick={startGoogle}
    >
      <FcGoogle className="size-5 shrink-0" aria-hidden />
      {isLoading ? "Checking…" : label}
    </Button>
  );
}
