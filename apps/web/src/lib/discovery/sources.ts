import type { Provider, Source } from "./types";

const source = (provider: Provider, board: string, company: string): Source => ({
  key: `${provider}:${board}`, provider, board, company,
  url: provider === "greenhouse" ? `https://job-boards.greenhouse.io/${board}`
    : provider === "lever" ? `https://jobs.lever.co/${board}`
    : provider === "ashby" ? `https://jobs.ashbyhq.com/${board}`
    : `https://careers.smartrecruiters.com/${board}`,
});

export const DISCOVERY_SOURCES: Source[] = [
  source("lever", "waremalcomb", "Ware Malcomb"),
  source("greenhouse", "trace3", "Trace3 · IT services"),
  source("greenhouse", "sonyinteractiveentertainmentglobal", "Sony Interactive Entertainment"),
  { key: "workday:usc", provider: "workday", board: "ExternalUSCCareers", company: "USC · University & health", url: "https://usc.wd5.myworkdayjobs.com/ExternalUSCCareers" },
  { key: "workday:motorolasolutions", provider: "workday", board: "Careers", company: "Motorola Solutions", url: "https://motorolasolutions.wd5.myworkdayjobs.com/Careers" },
  { key: "workday:hntb", provider: "workday", board: "HNTB_Careers", company: "HNTB", url: "https://hntb.wd5.myworkdayjobs.com/HNTB_Careers" },
  { key: "workday:travismathew", provider: "workday", board: "TravisMathew-Careers", company: "TravisMathew", url: "https://tcbrands.wd1.myworkdayjobs.com/TravisMathew-Careers" },
  { key: "rtx:california", provider: "rtx", board: "REC_RTX_Ext_Gateway", company: "RTX / Raytheon · California", url: "https://careers.rtx.com/global/en/search-results" },
  source("greenhouse", "toast", "Toast"),
  source("greenhouse", "samsara", "Samsara"),
  source("greenhouse", "smartsheet", "Smartsheet"),
  source("greenhouse", "workato", "Workato"),
  source("greenhouse", "lucidsoftware", "Lucid Software"),
  source("greenhouse", "agero", "Agero"),
  source("greenhouse", "humaninterest", "Human Interest"),
  source("greenhouse", "mercury", "Mercury"),
  source("greenhouse", "lattice", "Lattice"),
  source("greenhouse", "zestai", "Zest AI"),
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
  source("lever", "restaurant365", "Restaurant365"),
  source("greenhouse", "twilio", "Twilio"),
  source("ashby", "siftstack", "Sift"),
  source("ashby", "parkade", "Parkade"),
  source("smartrecruiters", "Experian", "Experian"),
  source("smartrecruiters", "WesternDigital", "Western Digital"),
  source("smartrecruiters", "AkrayaInc", "Akraya · Staffing"),
];

// These destinations are deliberately labelled manual sources, not scraped results.
export const LOCAL_SEARCHES = [
  { name: "CSULB CareerLINK · alumni", category: "Your university network", url: "https://www.csulb.edu/career-development-center/article/careerlink-job-board", note: "Jobs for CSULB students and alumni. Use your existing campus experience; search application support, IT support and service desk. Sign-in may be required." },
  { name: "MemorialCare", category: "Long Beach · Fountain Valley", url: "https://careers.memorialcare.org/search-jobs", note: "Filter to IT and full-time. Target desktop, service desk and business application support; clinical certifications still need evidence." },
  { name: "Hoag IT", category: "Newport Beach · Irvine", url: "https://careers.hoag.org/it/", note: "Look for end-user support and IT operations. Review the actual worksite and avoid roles requiring unheld clinical-system certifications." },
  { name: "Laserfiche", category: "Local software employer", url: "https://jobs.jobvite.com/laserfiche/", note: "Long Beach software support and implementation. Check posting dates and shift requirements on the employer page." },
  { name: "City of Long Beach", category: "Local government", url: "https://www.longbeach.gov/jobs/", note: "Business systems, technology services, and city operations." },
  { name: "Cal State Long Beach", category: "Higher education", url: "https://careers.pageuppeople.com/873/lb/en-us/listing/", note: "Campus IT and application support, building on your CSULB experience." },
  { name: "UC Irvine", category: "University & health", url: "https://jobs.uci.edu/", note: "Enterprise applications, service desk, and clinical systems." },
  { name: "Orange County", category: "Public sector", url: "https://www.governmentjobs.com/careers/oc", note: "IT analyst and systems support positions across county departments." },
  { name: "Robert Half", category: "Staffing", url: "https://www.roberthalf.com/us/en/jobs?searchTerm=application%20support&location=Seal%20Beach%2C%20CA", note: "Check full-time and direct-hire terms on each posting." },
  { name: "Insight Global", category: "Staffing", url: "https://insightglobal.com/jobs/", note: "Local application support and IT operations placements." },
];
