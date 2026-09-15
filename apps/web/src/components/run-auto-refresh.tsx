"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function RunAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = window.setInterval(refresh, 5_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, router]);

  return null;
}
