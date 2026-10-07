export function formatMoneyRange(
  minimum: number | null,
  maximum: number | null,
  fallback?: string | null,
) {
  if ((minimum !== null && minimum < 1000) || (maximum !== null && maximum < 1000)) return fallback || "Pay period not listed";
  if (minimum && maximum) {
    return `$${Math.round(minimum / 1000)}K–$${Math.round(maximum / 1000)}K`;
  }
  return fallback || "Not listed";
}

export function formatRelativeDate(date: Date) {
  const elapsed = Date.now() - date.getTime();
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function titleCaseStatus(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

export function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Compact display only; preserve the full employer worksite in stored data. */
export function formatJobLocation(value: string | null | undefined) {
  if (!value) return "Location not listed";
  return value.split(/;\s*/).map((part) => {
    const remote = part.match(/^US-([A-Z]{2})-REMOTE$/i);
    if (remote) return `${remote[1].toUpperCase()} · Remote`;
    const office = part.match(/^US-([A-Z]{2})-([A-Z][A-Z ]+?)-[A-Z0-9]+(?:\s*~|$)/i);
    return office ? `${office[2].toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())}, ${office[1].toUpperCase()}` : part;
  }).join("; ");
}
