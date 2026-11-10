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
  checkedAt?: string;
  linkedin?: { status: string; retryAfter?: string | null };
  applicationBrowser?: { online: boolean };
  automation?: { primaryPlatform: string | null; applicationPlatform?: string | null };
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
        <LoaderCircle size={12} className="spin" /><span className="health-label">Checking system</span>
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
          : "Tailoring ready";

  const device = (platform?: string | null) => platform === 'darwin' ? 'Mac' : platform === 'win32' ? 'Windows' : platform || 'Not selected';
  return (
    <>
    <span className="sr-only" role="status" aria-live="polite">{label}</span>
    <details className="system-status-details">
      <summary className={`system-health ${health.status === 'ready' ? 'system-health-ready' : 'system-health-warning'}`} aria-label={`${label}. Expand system status`}>
        {health.status === 'ready' ? <span className="health-dot" /> : <CircleAlert size={12} />}
        <span className="health-label">{label}</span>
      </summary>
      <div className="system-status-popover">
        <dl>
          <div><dt>Find · {device(health.automation?.primaryPlatform)}</dt><dd>Discovery computer selected. See Discover for schedule and source results.</dd></div>
          <div><dt>Tailor</dt><dd>{health.worker ? `${health.workers} workers online · ${health.activeRuns} active` : 'Worker offline'}{!health.baseResume ? ' · Base resume missing' : ''}</dd></div>
          <div><dt>Apply · {device(health.automation?.applicationPlatform)}</dt><dd>{health.applicationBrowser?.online ? 'Application browser online' : 'Application browser offline'}</dd></div>
          <div><dt>Workspace</dt><dd>{health.database ? 'Database connected' : 'Database unavailable'}</dd></div>
        </dl>
        {health.linkedin?.status === 'cooldown' ? <p>LinkedIn is cooling down. Other supported sources can continue.</p> : null}
        <p>{health.checkedAt ? `Checked ${new Date(health.checkedAt).toLocaleTimeString()}` : 'Latest status unavailable'}</p>
      </div>
    </details>
    </>
  );
}
