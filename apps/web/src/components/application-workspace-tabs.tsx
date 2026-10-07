"use client";

import { KeyboardEvent, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";

type WorkspaceTab = "changes" | "keywords" | "role" | "stretch-lab" | "apply";

export function ApplicationWorkspaceTabs({
  defaultTab,
  showKeywords,
  showStretchLab,
}: {
  defaultTab: WorkspaceTab;
  showKeywords: boolean;
  showStretchLab: boolean;
}) {
  const available: { id: WorkspaceTab; label: string }[] = useMemo(() => [
    { id: "changes", label: showKeywords ? "Review" : "Resume changes" },
    { id: "role", label: "Posting" },
    { id: "apply", label: "Apply" },
    ...(showStretchLab ? [{ id: "stretch-lab" as const, label: "Stretch Lab" }] : []),
  ], [showKeywords, showStretchLab]);
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const normalized = requested === "keywords" ? "changes" : requested;
  const active = available.find((tab) => tab.id === normalized)?.id
    ?? available.find((tab) => tab.id === defaultTab)?.id
    ?? "changes";
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  function selectTab(tab: WorkspaceTab) {
    if (tab === active) return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState({}, "", url);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? available.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + available.length) % available.length;
    const next = available[nextIndex].id;
    selectTab(next);
    buttons.current[next]?.focus();
  }

  useEffect(() => {
    const controlledSections: { id: string; owner: WorkspaceTab }[] = [
      { id: "changes", owner: "changes" },
      { id: "technology-coverage", owner: "changes" },
      ...(showKeywords ? [{ id: "keywords" as const, owner: "changes" as const }] : []),
      { id: "role", owner: "role" },
      { id: "apply", owner: "apply" },
      ...(showStretchLab
        ? [{ id: "stretch-lab" as const, owner: "stretch-lab" as const }]
        : []),
    ];
    for (const sectionControl of controlledSections) {
      const section = document.getElementById(sectionControl.id);
      if (section) {
        section.hidden = sectionControl.owner !== active;
        section.setAttribute("role", "tabpanel");
        section.setAttribute("aria-labelledby", `workspace-tab-${sectionControl.owner}`);
        section.tabIndex = 0;
      }
    }
    const provenance = document.getElementById("provenance");
    if (provenance) provenance.hidden = active !== "role";
  }, [active, showKeywords, showStretchLab]);

  return (
    <nav className="workspace-tabs" aria-label="Application workspace">
      <div className="workspace-tab-list" role="tablist">
        {available.map((tab, index) => (
        <button
          key={tab.id}
          ref={(element) => { buttons.current[tab.id] = element; }}
          id={`workspace-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-controls={tab.id === "changes" && showKeywords ? "changes keywords" : tab.id}
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          className={active === tab.id ? "workspace-tab workspace-tab-active" : "workspace-tab"}
          onClick={() => selectTab(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </button>
        ))}
      </div>
      <a href="#files" className="workspace-tab" onClick={() => selectTab("changes")}>Files</a>
    </nav>
  );
}
