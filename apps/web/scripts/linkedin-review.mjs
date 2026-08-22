import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright-core";

const DEFAULT_SEARCH_URL =
  "https://www.linkedin.com/jobs/search/?keywords=Application%20Support%20Engineer" +
  "&location=Seal%20Beach%2C%20California%2C%20United%20States" +
  "&distance=35&f_TPR=r86400&f_JT=F&sortBy=DD";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const limit = Math.max(1, Math.min(15, Number(option("--limit", "8"))));
const maxTailors = Math.max(0, Math.min(5, Number(option("--max-tailors", "3"))));
const searchUrl = option("--url", DEFAULT_SEARCH_URL);
const apiBase = option("--api", "http://127.0.0.1:3000").replace(/\/$/, "");
const queueQualified = process.argv.includes("--queue-qualified");
const includeDescriptions = process.argv.includes("--include-descriptions");
const exportDir = option("--export-dir", "");
const debugDom = process.argv.includes("--debug-dom");
const requestedJobIds = option("--job-ids", "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^\d{7,}$/.test(value));

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function canonicalJobUrl(jobId) {
  return `https://www.linkedin.com/jobs/view/${jobId}/`;
}

export function extractJobIdFromUrl(value) {
  try {
    const pathname = new URL(value, "https://www.linkedin.com").pathname;
    if (!pathname.includes("/jobs/view/")) return "";
    return pathname.match(/(\d{7,})\/?$/)?.[1] || "";
  } catch {
    return "";
  }
}

function normalize(text) {
  return (text || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

export function assessFit(job) {
  const title = job.title.toLowerCase();
  const description = job.description.toLowerCase();
  const combined = `${title}\n${description}`;
  let score = 0;
  const strengths = [];
  const gaps = [];

  if (/application support|production support|technical support|support analyst/.test(title)) {
    score += 34;
    strengths.push("direct support-role title");
  } else if (/technical client operations|client operations/.test(title)) {
    score += 30;
    strengths.push("direct client-operations title");
  } else if (/implementation|customer success|client support/.test(title)) {
    score += 24;
    strengths.push("transferable client-platform title");
  } else if (/application|systems?|platform|implementation/.test(title) && /analyst|engineer|specialist/.test(title)) {
    score += 22;
    strengths.push("transferable systems/application title");
  } else if (/support/.test(title)) {
    score += 14;
    strengths.push("support-oriented title");
  }

  const evidenceTerms = [
    ["sql", /\bsql\b/],
    ["SaaS", /\bsaas\b|software as a service/],
    ["API/Postman", /\bapi\b|postman|restful|webhook/],
    ["incident troubleshooting", /incident|troubleshoot|root cause|production support/],
    ["Microsoft 365/identity", /microsoft 365|office 365|\bentra\b|azure ad|active directory|\brbac\b|\bsso\b/],
    ["Jira/ticketing", /\bjira\b|ticket(?:ing| queue|s\b)|service desk|service now|servicenow|\bintercom\b/],
    ["Windows/Linux/cloud", /windows|linux|\baws\b|\bazure\b|cloud/],
    ["Python/PowerShell", /python|powershell|scripting|automation/],
    ["implementation/onboarding", /implementation|onboarding|go-live|account setup/],
    ["fintech/financial services", /fintech|financial services|financial operations|investment systems?|payments?/],
  ];
  for (const [label, pattern] of evidenceTerms) {
    if (pattern.test(combined)) {
      score += 5;
      strengths.push(label);
    }
  }

  if (/senior|sr\.|lead|principal|manager|director|architect/.test(title)) {
    score -= 38;
    gaps.push("senior/lead scope");
  }

  const blockers = [
    ["Encompass/residential-lending experience", /encompass|loan origination system|residential lending/],
    ["Epic/EHR certification or domain", /\bepic\b|optime|certified.*epic|ehr application/],
    ["specialized ERP ownership", /\bukg\b|workday|peoplesoft|oracle ebs|sap.*(?:required|years)/],
    ["licensed clinical background", /registered nurse|clinical license|pharmacist|medical license/],
    ["security clearance", /active (?:secret|top secret)|security clearance required/],
  ];
  let blocked = false;
  for (const [label, pattern] of blockers) {
    if (pattern.test(combined)) {
      score -= 42;
      gaps.push(label);
      blocked = true;
    }
  }

  const specializedDomains = [
    [
      "specialized GPU/data-center infrastructure",
      [
        /bare[- ]metal/,
        /gpu (?:fleet|cluster|workload)/,
        /high.performance computing|\bhpc\b/,
        /firmware|bios configuration/,
        /data center environment/,
      ],
    ],
    [
      "specialized building-controls field work",
      [
        /building controls?/,
        /hvac/,
        /thermostat platforms?/,
        /gateway devices?|electrical meters?|sensors?/,
        /field engineer|site visits?|commission(?:ing)?/,
      ],
    ],
  ];
  for (const [label, patterns] of specializedDomains) {
    const matches = patterns.filter((pattern) => pattern.test(combined)).length;
    if (matches >= 3) {
      score -= 24;
      gaps.push(label);
    }
  }

  const years = [
    ...description.matchAll(/(?:minimum|required|at least)[^\n.]{0,55}?(\d+)\+?\s*years?/g),
    ...description.matchAll(
      /(\d+)\+?\s*years? of (?:relevant |professional |enterprise |technical |hands-on |customer support |application support )+experience/g,
    ),
  ]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  if (years.some((value) => value >= 5)) {
    score -= 22;
    gaps.push("requires 5+ years");
  }

  const qualified = !blocked && score >= 48;
  return { score, qualified, strengths: [...new Set(strengths)], gaps: [...new Set(gaps)] };
}

export function extractSalary(text) {
  const asciiText = normalize(text).replace(/\u2013|\u2014/g, "-");
  const match = asciiText.match(
    /\$\s?\d[\d,.]*(?:\.\d+)?\s*[Kk]?\s*(?:-|–|—|to)\s*\$\s?\d[\d,.]*(?:\.\d+)?\s*[Kk]?(?:\s*\/(?:yr|year|hr|hour))?/i,
  );
  return normalize(match?.[0] || "").replace(/[,.]$/, "");
}

export function parseTopCardMetadata({ title, company, metadataText }) {
  const lines = normalize(metadataText).split("\n").map(normalize).filter(Boolean);
  const candidates = lines.filter((line) => line !== title && line !== company);
  const combined = candidates.join(" · ");
  const posted = combined.match(/(?:reposted\s+)?\d+\s+(?:minute|hour|day|week|month)s?\s+ago/i)?.[0] || "";
  const applicants =
    combined.match(/(?:over\s+)?\d[\d,]*\+?\s+(?:people clicked apply|applicants?)/i)?.[0] || "";
  const metadataLine =
    candidates.find((line) => /(?:ago|people clicked apply|applicants?)/i.test(line)) ||
    candidates.find((line) => /\bremote\b|\bhybrid\b|\bon-site\b|,\s*[A-Z]{2}\b|united states/i.test(line)) ||
    "";
  const location = normalize(metadataLine.split(/\s+[·•]\s+/)[0] || "");
  const scopedLocation =
    normalize(metadataLine.replace(/\s+(?:\u00b7|\u2022)\s+.*$/, "")) || location;
  return { location: scopedLocation, posted: normalize(posted), applicants: normalize(applicants) };
}

async function collectJobIds(page) {
  const ids = [];
  const seen = new Set();
  for (let pass = 0; pass < 14 && ids.length < limit; pass += 1) {
    const visibleIds = await page.evaluate(() => {
      const found = [];
      for (const element of document.querySelectorAll("[data-occludable-job-id]")) {
        const id = element.getAttribute("data-occludable-job-id");
        if (id && /^\d{7,}$/.test(id)) found.push(id);
      }
      for (const anchor of document.querySelectorAll('a[href*="/jobs/view/"]')) {
        const pathname = new URL(anchor.href, location.href).pathname;
        const match = pathname.match(/(\d{7,})\/?$/);
        if (match) found.push(match[1]);
      }
      return found;
    });
    for (const id of visibleIds) {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    if (ids.length >= limit) break;
    await page.evaluate(() => {
      const candidates = [...document.querySelectorAll("div,ul")].filter(
        (element) =>
          element.scrollHeight > element.clientHeight + 50 &&
          element.clientHeight > 300 &&
          element.offsetLeft < 700 &&
          element.querySelector('[data-occludable-job-id],a[href*="/jobs/view/"]'),
      );
      if (candidates[0]) candidates[0].scrollTop += 850;
      else window.scrollBy(0, 850);
    });
    await sleep(1100);
  }
  return ids.slice(0, limit);
}

async function extractJob(page, jobId) {
  const detailUrl = canonicalJobUrl(jobId);
  await page.goto(detailUrl, { waitUntil: "commit", timeout: 35_000 }).catch(() => undefined);
  await sleep(5000);

  const bodyText = normalize(await page.locator("body").innerText().catch(() => ""));
  if (/quick security check|unusual activity|verify it'?s you|captcha/i.test(bodyText)) {
    throw new Error("LinkedIn requested a security check; stopping immediately.");
  }

  const extracted = await page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
    const h1 = [...document.querySelectorAll("h1")].find((element) => clean(element.innerText).length > 3);
    let title = clean(h1?.innerText);
    let company = "";
    const companyAnchor = [...document.querySelectorAll('a[href*="/company/"]')].find(
      (element) => clean(element.innerText).length > 1,
    );
    company = clean(companyAnchor?.innerText);

    const titleParts = document.title.split(" | ").map(clean).filter(Boolean);
    if (!title && titleParts.length) title = titleParts[0];
    if (!company && titleParts.length > 1 && titleParts[1] !== "LinkedIn") company = titleParts[1];

    for (const button of document.querySelectorAll("button")) {
      const label = clean(button.innerText || button.textContent).toLowerCase();
      if ((label === "see more" || label === "show more") && button.closest('[id*="job-details"], [class*="description"]')) {
        button.click();
      }
    }

    let description = "";
    for (const selector of [
      "#job-details",
      '[id*="job-details"]',
      ".jobs-description-content__text",
      ".jobs-description__content",
      '[class*="description__text"]',
      ".show-more-less-html",
    ]) {
      const element = document.querySelector(selector);
      const text = clean(element?.innerText);
      if (text.length > description.length && text.length <= 20_000) description = text;
    }
    if (description.length < 300) {
      const heading = [...document.querySelectorAll("h2,h3,h4")].find((element) =>
        /about the job/i.test(clean(element.innerText)),
      );
      let parent = heading;
      for (let depth = 0; parent && depth < 5; depth += 1, parent = parent.parentElement) {
        const text = clean(parent.innerText);
        if (text.length >= 300 && text.length <= 15_000) {
          description = text;
          break;
        }
      }
    }

    let location = "";
    const titleContainer = h1?.parentElement?.parentElement;
    if (titleContainer) {
      const lines = clean(titleContainer.innerText).split("\n").map(clean).filter(Boolean);
      location = lines.find((line) => /,\s*[A-Z]{2}\b|remote|hybrid/i.test(line)) || "";
    }
    const topCard =
      h1?.closest(".job-details-jobs-unified-top-card__container") ||
      h1?.closest('[class*="top-card"]') ||
      titleContainer;
    const primaryMetadata = topCard?.querySelector(
      ".job-details-jobs-unified-top-card__primary-description-container",
    );
    const metadataText = clean(primaryMetadata?.innerText || topCard?.innerText);
    const debugAncestors = [];
    let ancestor = h1;
    for (let depth = 0; ancestor && depth < 7; depth += 1, ancestor = ancestor.parentElement) {
      debugAncestors.push({
        depth,
        tag: ancestor.tagName,
        className: clean(ancestor.className),
        text: clean(ancestor.innerText).slice(0, 1200),
      });
    }
    return { title, company, location, description, metadataText, debugAncestors };
  });

  await sleep(700);
  const fullText = normalize(await page.locator("body").innerText().catch(() => ""));
  const title = normalize(extracted.title);
  const company = normalize(extracted.company) || "Unknown";
  let metadata = parseTopCardMetadata({
    title,
    company,
    metadataText: `${extracted.metadataText}\n${extracted.location}`,
  });
  let location = metadata.location || normalize(extracted.location);
  if (!location || location === title) {
    const lines = fullText.split("\n").map(normalize).filter(Boolean);
    const titleIndex = lines.findIndex((line) => line === title);
    const nearby = titleIndex >= 0 ? lines.slice(titleIndex + 1, titleIndex + 14) : [];
    location =
      nearby.find(
        (line) =>
          line !== company &&
          (/\bremote\b|\bhybrid\b|\bon-site\b|,\s*[A-Z]{2}\b/i.test(line)),
      ) || "";
  }
  if (location) {
    const fallbackMetadata = parseTopCardMetadata({ title, company, metadataText: location });
    metadata = {
      location: metadata.location || fallbackMetadata.location,
      posted: metadata.posted || fallbackMetadata.posted,
      applicants: metadata.applicants || fallbackMetadata.applicants,
    };
    location = metadata.location || location;
  }
  const salary = fullText.match(/\$[\d,.]+\s*[Kk]?\s*[–-]\s*\$[\d,.]+\s*[Kk]?[^\n]{0,20}/)?.[0] || "";
  const jobSalary = extractSalary(`${extracted.metadataText}\n${extracted.description}`) || normalize(salary);
  const posted = metadata.posted;
  const applicants = metadata.applicants;
  const job = {
    jobId,
    url: canonicalJobUrl(jobId),
    title,
    company,
    location,
    salary: jobSalary,
    posted: normalize(posted),
    applicants: normalize(applicants),
    description: normalize(extracted.description),
  };
  if (debugDom) job.debug = { metadataText: extracted.metadataText, ancestors: extracted.debugAncestors };
  return { ...job, fit: assessFit(job) };
}

export function buildPaste(job) {
  const applicantCount = job.applicants.match(/\d[\d,]*/)?.[0] || "";
  const metadata = [job.location, job.posted, job.applicants].filter(Boolean).join(" · ");
  const cleanMetadata = metadata.replace(/\s*Â?·\s*/g, " · ");
  const safeMetadata =
    [job.location, job.posted, job.applicants].filter(Boolean).join(" \u00b7 ") || cleanMetadata;
  const arrangement = /remote/i.test(job.location)
    ? "Remote"
    : /hybrid/i.test(job.location)
      ? "Hybrid"
      : "";
  const description = job.description.replace(/^About the job\s*/i, "").trim();
  return [
    `Company logo for, ${job.company}.`,
    job.company,
    job.title,
    safeMetadata,
    arrangement,
    "Full-time",
    job.salary,
    applicantCount ? "Applicants" : "",
    applicantCount,
    `Source URL: ${job.url}`,
    "About the job",
    description,
  ]
    .filter(Boolean)
    .join("\n");
}

function safeSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "job";
}

async function exportReviewFixtures(jobs, directory) {
  if (!directory) return [];
  const resolvedDirectory = path.resolve(directory);
  await mkdir(resolvedDirectory, { recursive: true });
  const exported = [];
  for (const job of jobs) {
    const filename = `linkedin_${job.jobId}_${safeSlug(`${job.company}_${job.title}`)}.txt`;
    const destination = path.join(resolvedDirectory, filename);
    await writeFile(destination, `${buildPaste(job)}\n`, { encoding: "utf8", flag: "wx" });
    exported.push(destination);
  }
  const manifestPath = path.join(resolvedDirectory, "manifest.json");
  const manifest = {
    capturedAt: new Date().toISOString(),
    source: "LinkedIn visible browser review",
    readOnly: true,
    jobs: jobs.map(({ description, ...job }, index) => ({
      ...job,
      descriptionLength: description.length,
      fixture: path.basename(exported[index]),
    })),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  return exported;
}

async function capture(job) {
  const response = await fetch(`${apiBase}/api/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawPaste: buildPaste(job), sourceUrl: job.url, queueTailoring: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Capture failed with HTTP ${response.status}`);
  return payload;
}

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  try {
  const context = browser.contexts()[0];
  const page = context.pages().find((candidate) => candidate.url().includes("linkedin.com/jobs")) || (await context.newPage());
  await page.goto(searchUrl, { waitUntil: "commit", timeout: 35_000 }).catch(() => undefined);
  await sleep(4500);
  if (/login|authwall/i.test(page.url())) throw new Error("The dedicated Chrome profile is not signed into LinkedIn.");

  const jobIds = requestedJobIds.length ? requestedJobIds.slice(0, limit) : await collectJobIds(page);
  if (!jobIds.length) throw new Error("No LinkedIn job cards were found. The page layout or search may have changed.");

  const jobs = [];
  for (const [index, jobId] of jobIds.entries()) {
    process.stderr.write(`[${index + 1}/${jobIds.length}] reviewing ${jobId}\n`);
    const job = await extractJob(page, jobId);
    if (job.title && job.description.length >= 250) jobs.push(job);
    if (index < jobIds.length - 1) await sleep(5000 + Math.floor(Math.random() * 3000));
  }

  jobs.sort((left, right) => right.fit.score - left.fit.score);
  let queued = 0;
  for (const job of jobs) {
    job.capture = { status: "review_only" };
    if (queueQualified && job.fit.qualified && queued < maxTailors) {
      try {
        const result = await capture(job);
        job.capture = { status: result.duplicate ? "duplicate" : "queued", applicationId: result.id };
        if (!result.duplicate) queued += 1;
      } catch (error) {
        job.capture = { status: "error", error: error instanceof Error ? error.message : String(error) };
      }
    }
  }
  const printableJobs = includeDescriptions
    ? jobs
    : jobs.map(({ description, ...job }) => ({
        ...job,
        descriptionLength: description.length,
        descriptionExcerpt: description.slice(0, 800),
      }));
  const exported = await exportReviewFixtures(jobs, exportDir);
  console.log(JSON.stringify({ searchUrl, reviewed: jobs.length, queued, exported, jobs: printableJobs }, null, 2));
  // Force only this short-lived Node client to exit. Calling browser.close()
  // would also close the visible Chrome instance connected over CDP.
  process.exit(0);
  } finally {
    // Do not call browser.close() here. This is a CDP connection to Brian's
    // dedicated visible Chrome window; process exit disconnects without closing it.
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
