"use client";

import { useEffect, useState } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/cn";
import { SystemStatus } from "@/components/system-status";
import { QuickAnswers } from "@/components/quick-answers";

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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("aiadapply:sidebar-collapsed");
    queueMicrotask(() => setCollapsed(stored === null ? window.innerWidth < 1280 : stored === "true"));
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      window.localStorage.setItem("aiadapply:sidebar-collapsed", String(!current));
      return !current;
    });
  }

  return (
    <div className={cn("app-shell", collapsed && "sidebar-collapsed")}>
      <aside className="sidebar">
        <Link href="/" className="sidebar-brand" aria-label="AiadApply home">
          <BrandMark className="brand-mark" />
          <span className="sidebar-brand-copy">
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
          aria-label="Capture job"
          title="Capture job"
          style={{ width: "100%", marginTop: 28 }}
        >
          <Plus size={15} />
          <span className="sidebar-link-label">Capture job</span>
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
                aria-label={item.label}
                title={item.label}
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
                <span className="sidebar-link-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            <Settings size={16} />
            <span className="sidebar-link-label">Settings</span>
          </Link>
          <div className="muted sidebar-footer-copy" style={{ marginTop: 15, fontSize: 10 }}>
            Brian’s workspace
          </div>
        </div>
      </aside>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <main className="main-frame" id="main-content">
        <header className="topbar">
          <div className="topbar-workspace">
            <button className="sidebar-toggle" type="button" onClick={toggleSidebar} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} title={collapsed ? "Expand navigation" : "Collapse navigation"}>
              {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>
            <div>
              <div className="eyebrow">Brian Aiad</div>
              <div className="topbar-tagline">
                One application at a time
              </div>
            </div>
          </div>
          <div className="topbar-actions"><QuickAnswers /><SystemStatus /></div>
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
