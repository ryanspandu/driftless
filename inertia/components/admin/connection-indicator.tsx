
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { AlertTriangle, Loader2, Wifi, WifiOff } from "lucide-react";
import { buttonVariants } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

const HEALTH_PATH = "/health";
const CHECK_TIMEOUT_MS = 5000;
const CHECK_POLL_MS = 45_000;

/** External probes used to detect real internet access (not just LAN/Wi‑Fi link). */
const INTERNET_PROBES = [
  "https://cloudflare.com/cdn-cgi/trace",
  "https://www.google.com/generate_204",
] as const;

function subscribe(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

async function fetchReachable(
  url: string,
  init: RequestInit & { mode?: RequestMode } = {},
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      ...init,
    });
    if (init.mode === "no-cors") return true;
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function checkHealth(): Promise<boolean> {
  return fetchReachable(HEALTH_PATH, { method: "GET" });
}

async function checkInternet(): Promise<boolean> {
  for (const url of INTERNET_PROBES) {
    const useNoCors = url.includes("google.com");
    const ok = await fetchReachable(url, {
      method: useNoCors ? "HEAD" : "GET",
      mode: useNoCors ? "no-cors" : "cors",
    });
    if (ok) return true;
  }
  return false;
}

type IndicatorState =
  | "offline"
  | "checking"
  | "no-internet"
  | "server-down"
  | "ok";

export function ConnectionIndicator() {
  const linkUp = useSyncExternalStore(
    subscribe,
    getOnlineSnapshot,
    getServerSnapshot,
  );

  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [internetOk, setInternetOk] = useState<boolean | null>(null);

  const runChecks = useCallback(async () => {
    if (!linkUp) return;
    const [health, internet] = await Promise.all([
      checkHealth(),
      checkInternet(),
    ]);
    setHealthOk(health);
    setInternetOk(internet);
  }, [linkUp]);

  useEffect(() => {
    if (!linkUp) {
      setHealthOk(null);
      setInternetOk(null);
      return;
    }

    let intervalId: number | undefined;

    const stopPolling = () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const startPolling = () => {
      stopPolling();
      void runChecks();
      intervalId = window.setInterval(() => {
        void runChecks();
      }, CHECK_POLL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    if (document.visibilityState === "visible") {
      startPolling();
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopPolling();
    };
  }, [linkUp, runChecks]);

  let mode: IndicatorState;
  if (!linkUp) {
    mode = "offline";
  } else if (healthOk === null || internetOk === null) {
    mode = "checking";
  } else if (!internetOk) {
    mode = "no-internet";
  } else if (!healthOk) {
    mode = "server-down";
  } else {
    mode = "ok";
  }

  const label =
    mode === "offline"
      ? "No network connection"
      : mode === "checking"
        ? "Checking connection…"
        : mode === "no-internet"
          ? healthOk
            ? "Wi‑Fi/LAN connected, no internet"
            : "Wi‑Fi/LAN connected, no internet access"
          : mode === "server-down"
            ? "Internet connected, server unreachable"
            : "Network, internet, and server connected";

  const tooltip =
    mode === "offline"
      ? "Offline — connect to Wi‑Fi or mobile data."
      : mode === "checking"
        ? "Checking local network, internet, and server…"
        : mode === "no-internet"
          ? healthOk
            ? "You are connected to Wi‑Fi or LAN and this app server is reachable, but there is no internet access. Background sync and external services may not work until connectivity is restored."
            : "You are connected to Wi‑Fi or LAN, but there is no internet access and the app server could not be reached. Check your router or gateway."
          : mode === "server-down"
            ? "Internet is available, but this app server did not respond to /health. Check that the server is running."
            : "Online — local network, internet, and app server are all reachable.";

  return (
    <Tooltip>
      <TooltipTrigger
        delay={0}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "size-10 shrink-0",
          mode === "ok" && "text-emerald-600 dark:text-emerald-500",
          mode === "offline" && "text-destructive",
          (mode === "no-internet" || mode === "server-down") &&
            "text-amber-600 dark:text-amber-500",
          mode === "checking" && "text-muted-foreground",
        )}
        aria-label={label}
      >
        {!linkUp ? (
          <WifiOff className="size-5" aria-hidden />
        ) : healthOk === null || internetOk === null ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : mode === "no-internet" ? (
          <Wifi className="size-5" aria-hidden />
        ) : !healthOk ? (
          <AlertTriangle className="size-5" aria-hidden />
        ) : (
          <Wifi className="size-5" aria-hidden />
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
