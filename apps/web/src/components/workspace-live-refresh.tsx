"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Read-only status refresh; discovery and application workers own all actions. */
export function WorkspaceLiveRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let lastRefresh = 0;
    const refresh = () => {
      if (pending || document.visibilityState !== "visible" || Date.now() - lastRefresh < 1000) return;
      lastRefresh = Date.now();
      startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pending, router]);
  return null;
}
