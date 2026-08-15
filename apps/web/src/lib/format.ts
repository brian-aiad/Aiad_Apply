export function formatMoneyRange(
  minimum: number | null,
  maximum: number | null,
  fallback?: string | null,
) {
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
