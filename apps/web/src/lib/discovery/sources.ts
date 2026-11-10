import type { Provider, Source } from "./types";

const source = (provider: Provider, board: string, company: string): Source => ({
  key: `${provider}:${board}`, provider, board, company,
  url: provider === "greenhouse" ? `https://job-boards.greenhouse.io/${board}`
    : provider === "lever" ? `https://jobs.lever.co/${board}`
    : provider === "ashby" ? `https://jobs.ashbyhq.com/${board}`
    : `https://careers.smartrecruiters.com/${board}`,
});

export const DISCOVERY_SOURCES: Source[] = [
  source("greenhouse", "laclippers", "LA Clippers"),
  source("greenhouse", "vianttechnology", "Viant Technology · Platform operations"),
  { key: "oracle:hoag", provider: "oracle", board: "hoag", company: "Hoag · Information technology", url: "https://jobs.hoag.org/en/sites/CX_1/jobs" },
  { key: "oracle:lbtransit", provider: "oracle", board: "lbtransit", company: "Long Beach Transit", url: "https://myportal.lbtransit.com/hcmUI/CandidateExperience/en/sites/CX_1/jobs" },
  { key: "edjoin:orange-schools", provider: "edjoin", board: "517,531,529,521,509", company: "Orange County public schools · IT support", url: "https://www.edjoin.org/iusd" },
  { key: "calcareers:orange", provider: "calcareers", board: "358", company: "California state · Orange County IT", url: "https://calcareers.ca.gov/CalHRPublic/Search/JobSearchResults.aspx#kw=Information%20Technology&locid=358" },
  { key: "calcareers:losangeles", provider: "calcareers", board: "681", company: "California state · Los Angeles County IT", url: "https://calcareers.ca.gov/CalHRPublic/Search/JobSearchResults.aspx#kw=Information%20Technology&locid=681" },
  { key: "trinet:balboa", provider: "trinet", board: "50346", company: "Balboa Technologies", url: "https://app.trinethire.com/companies/50346-balboa-technologies/jobs" },
  { key: "luxus:careers", provider: "luxus", board: "careers", company: "Luxus Group", url: "https://luxusjobs.com/careers" },
  { key: "workday:pacificlife", provider: "workday", board: "PacificLifeCareers", company: "Pacific Life · Local business technology", url: "https://pacificlife.wd1.myworkdayjobs.com/PacificLifeCareers" },
  { key: "pageup:csulb", provider: "pageup", board: "873/lb", company: "CSULB · Staff technology roles", url: "https://careers.pageuppeople.com/873/lb/en-us/listing/" },
  { key: "jobvite:laserfiche", provider: "jobvite", board: "laserfiche", company: "Laserfiche", url: "https://jobs.jobvite.com/laserfiche/jobs" },
  { key: "workday:primoris", provider: "workday", board: "Primoris", company: "Primoris · Business application support", url: "https://prim.wd108.myworkdayjobs.com/Primoris" },
  { key: "workday:scan", provider: "workday", board: "scancareers", company: "SCAN · Local health-plan systems", url: "https://scanhealthplan.wd108.myworkdayjobs.com/scancareers" },
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
  { name: "City of Long Beach", category: "Local government", url: "https://www.longbeach.gov/jobs/", note: "Business systems, technology services, and city operations." },
  { name: "UC Irvine", category: "University & health", url: "https://jobs.uci.edu/", note: "Enterprise applications, service desk, and clinical systems." },
  { name: "Orange County", category: "Public sector", url: "https://www.governmentjobs.com/careers/oc", note: "IT analyst and systems support positions across county departments." },
  { name: "Robert Half", category: "Staffing", url: "https://www.roberthalf.com/us/en/jobs?searchTerm=application%20support&location=Seal%20Beach%2C%20CA", note: "Check full-time and direct-hire terms on each posting." },
  { name: "Insight Global", category: "Staffing", url: "https://insightglobal.com/jobs/", note: "Local application support and IT operations placements." },
];
