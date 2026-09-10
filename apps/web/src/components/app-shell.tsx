"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BriefcaseBusiness,
  Crosshair,
  FileInput,
  Plus,
  Settings,
  Search,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/cn";
import { SystemStatus } from "@/components/system-status";

const navigation = [
  { href: "/", label: "Today", icon: Crosshair },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/applications", label: "Applications", icon: BriefcaseBusiness },
  { href: "/capture", label: "Capture job", icon: FileInput },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const mobileNavigation = [
  ...navigation,
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandMark className="brand-mark" />
          <span>
            <span style={{ display: "block", fontWeight: 700, letterSpacing: "-0.02em" }}>
              AiadApply
            </span>
            <span className="muted" style={{ display: "block", fontSize: 10 }}>
              Your application workspace
            </span>
          </span>
        </Link>

        <Link
          href="/capture"
          className="button button-primary"
          style={{ width: "100%", marginTop: 28 }}
        >
          <Plus size={15} />
          Capture job
        </Link>

        <nav aria-label="Primary navigation" style={{ display: "grid", gap: 4, marginTop: 25 }}>
          {navigation.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("sidebar-link", active && "sidebar-link-active")}
                aria-current={active ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  minHeight: 39,
                  padding: "0 11px",
                  borderRadius: 8,
                  color: active ? "var(--text)" : "var(--text-secondary)",
                  background: active ? "var(--violet-soft)" : "transparent",
                  fontSize: 13,
                  fontWeight: active ? 650 : 500,
                }}
              >
                <Icon size={16} strokeWidth={1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div
          style={{
            position: "absolute",
            right: 16,
            bottom: 18,
            left: 16,
            paddingTop: 16,
            borderTop: "1px solid var(--line)",
          }}
        >
          <Link
            href="/settings"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            <Settings size={16} />
            Settings
          </Link>
          <div className="muted" style={{ marginTop: 15, fontSize: 10 }}>
            Brian’s workspace
          </div>
        </div>
      </aside>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <main className="main-frame" id="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">Brian Aiad</div>
            <div style={{ marginTop: 1, fontSize: 13, fontWeight: 600 }}>
              One application at a time
            </div>
          </div>
          <SystemStatus />
        </header>
        {children}
      </main>
      <nav aria-label="Mobile navigation" className="mobile-nav">
        {mobileNavigation.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("mobile-nav-link", active && "mobile-nav-link-active")}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{item.label === "Applications" ? "Apps" : item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
