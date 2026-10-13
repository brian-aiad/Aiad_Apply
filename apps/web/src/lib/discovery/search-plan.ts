import type { DiscoveryPreferences } from "./types";

// Queries cover different employer naming conventions; none require a paid API.
export const SUPPORT_SEARCHES = [
  { title: "Application & SaaS support", query: '"application support" OR "software support" OR "SaaS support"', fit: "SQL, logs, incidents and business applications." },
  { title: "Technical & product support", query: '"technical support" OR "product support engineer"', fit: "Software troubleshooting, APIs and customer escalations; check hardware requirements." },
  { title: "Desktop & end-user support", query: '"desktop support" OR "end user support" OR "IT support"', fit: "Windows, Microsoft 365, access and employee troubleshooting." },
  { title: "Help desk & service desk", query: '"help desk" OR "helpdesk" OR "service desk"', fit: "Tickets, SLAs, user communication and issue resolution." },
  { title: "Systems & IT operations", query: '"systems administrator" OR "IT operations specialist" OR "IT specialist"', fit: "Account administration and operational support; check infrastructure depth." },
  { title: "Implementation support", query: '"implementation specialist" OR "integration support"', fit: "Customer onboarding, configuration and data troubleshooting." },
];

export function supportSearchLinks(preferences: DiscoveryPreferences) {
  return SUPPORT_SEARCHES.map(search => ({ ...search,
    indeed: `https://www.indeed.com/jobs?${new URLSearchParams({ q: `(${search.query}) $${preferences.minimumSalary}`, jt: "fulltime", l: "Seal Beach, CA", radius: String(preferences.radiusMiles), fromage: "7", sort: "date" })}`,
    linkedin: `https://www.linkedin.com/jobs/search/?${new URLSearchParams({ keywords: search.query, location: "Seal Beach, California, United States", distance: String(preferences.radiusMiles), f_JT: "F", f_TPR: "r604800", sortBy: "DD" })}`,
  }));
}

export function recommendedPosting(postedAt: string | Date | null, lastSeenAt: string | Date, now: Date) {
  const seen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seen) || seen > now.getTime() || now.getTime() - seen > 48 * 3600000) return false;
  if (!postedAt) return true; // Recently verified active, never labelled newly posted.
  const posted = new Date(postedAt).getTime();
  return Number.isFinite(posted) && posted <= now.getTime();
}
