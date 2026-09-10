import type { Provider, Source } from "./types";

const source = (provider: Provider, board: string, company: string): Source => ({
  key: `${provider}:${board}`, provider, board, company,
  url: provider === "greenhouse" ? `https://job-boards.greenhouse.io/${board}`
    : provider === "lever" ? `https://jobs.lever.co/${board}`
    : provider === "ashby" ? `https://jobs.ashbyhq.com/${board}`
    : `https://careers.smartrecruiters.com/${board}`,
});

export const DISCOVERY_SOURCES: Source[] = [
  source("greenhouse", "rocketlab", "Rocket Lab"),
  source("greenhouse", "vast", "Vast"),
  source("greenhouse", "relativity", "Relativity Space"),
  source("greenhouse", "andurilindustries", "Anduril"),
  source("greenhouse", "trueanomalyinc", "True Anomaly"),
  source("greenhouse", "spacex", "SpaceX"),
  source("greenhouse", "thetradedesk", "The Trade Desk"),
  source("lever", "irvine-clinical", "Irvine Clinical Research"),
  source("lever", "fluxergy-2", "Fluxergy"),
  source("lever", "floqast", "FloQast"),
  source("ashby", "siftstack", "Sift"),
  source("ashby", "parkade", "Parkade"),
  source("smartrecruiters", "Experian", "Experian"),
  source("smartrecruiters", "WesternDigital", "Western Digital"),
  source("smartrecruiters", "AkrayaInc", "Akraya · Staffing"),
];

// These destinations are deliberately labelled manual sources, not scraped results.
export const LOCAL_SEARCHES = [
  { name: "City of Long Beach", category: "Local government", url: "https://www.longbeach.gov/jobs/", note: "Business systems, technology services, and city operations." },
  { name: "Cal State Long Beach", category: "Higher education", url: "https://careers.pageuppeople.com/873/lb/en-us/listing/", note: "Campus IT and application support, building on your CSULB experience." },
  { name: "UC Irvine", category: "University & health", url: "https://jobs.uci.edu/", note: "Enterprise applications, service desk, and clinical systems." },
  { name: "Orange County", category: "Public sector", url: "https://www.governmentjobs.com/careers/oc", note: "IT analyst and systems support positions across county departments." },
  { name: "Robert Half", category: "Staffing", url: "https://www.roberthalf.com/us/en/jobs?searchTerm=application%20support&location=Seal%20Beach%2C%20CA", note: "Check full-time and direct-hire terms on each posting." },
  { name: "Insight Global", category: "Staffing", url: "https://insightglobal.com/jobs/", note: "Local application support and IT operations placements." },
];
