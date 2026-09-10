"use client";
import { useEffect } from "react";

// The server lease deduplicates refreshes across tabs, processes, and devices.
export function DiscoveryAutoRefresh() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DISABLE_DISCOVERY_AUTO_REFRESH === "1") return;
    void fetch("/api/discovery/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: false }) }).catch(() => {});
  }, []);
  return null;
}
