"use client";

import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";

type Health = {
  status: "ready" | "attention" | "offline";
  database: boolean;
  baseResume: boolean;
  worker: boolean;
  workers: number;
  activeRuns: number;
};

export function SystemStatus() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const value = (await response.json()) as Health;
        if (active) setHealth(value);
      } catch {
        if (active) {
          setHealth({
            status: "offline",
            database: false,
            baseResume: false,
            worker: false,
            workers: 0,
            activeRuns: 0,
          });
        }
      }
    };
    void check();
    const timer = window.setInterval(check, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!health) {
    return (
      <span className="system-health muted" aria-label="Checking system status">
        <LoaderCircle size={12} className="spin" /> Checking system
      </span>
    );
  }

  const label =
    health.status === "offline"
      ? "Dashboard offline"
      : !health.baseResume
        ? "Base resume missing"
        : !health.worker
          ? "Worker not running"
        : health.activeRuns > 0
          ? `${health.activeRuns} tailoring ${health.activeRuns === 1 ? "run" : "runs"}`
          : "System ready";

  return (
    <span
      className={`system-health ${
        health.status === "ready" ? "system-health-ready" : "system-health-warning"
      }`}
      title={`Database: ${health.database ? "connected" : "offline"}. Base resume: ${health.baseResume ? "ready" : "missing"}. Worker: ${health.worker ? `${health.workers} online` : "not running"}.`}
      role="status"
      aria-live="polite"
    >
      {health.status === "ready" ? <span className="health-dot" /> : <CircleAlert size={12} />}
      {label}
    </span>
  );
}
