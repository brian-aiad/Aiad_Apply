/** Visible, authenticated LinkedIn discovery. No application submission or direct tailoring. */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdir, open, readFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
import { linkedInSearchForWindow } from '../src/lib/discovery/linkedin-search.mjs';

export const SUPPORT_QUERIES = [
  '"Application Support" OR "Production Support"',
  '"Technical Support" OR "Product Support"',
  '"IT Support" OR "Desktop Support"',
  '"Service Desk" OR "Help Desk"',
  '"Implementation Specialist" OR "Integration Support"',
  '"Business Applications" OR "Platform Support"',
];
export function buildSearchUrl(query, window = 'day') {
  const url = new URL('https://www.linkedin.com/jobs/search/');
  url.search = new URLSearchParams({ keywords: query, location: 'Seal Beach, California, United States',
    distance: '35', f_TPR: window === 'week' ? 'r604800' : 'r86400', f_JT: 'F', sortBy: 'DD' }).toString();
  // LinkedIn supplies a broad envelope. The server enforces the actual 30-mile worksite limit.
  return url.href;
}
export function linkedinJobId(value) {
  try {
    const url = new URL(value, 'https://www.linkedin.com');
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    return url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{7,})\/?$/)?.[1]
      || (/^\d{7,}$/.test(url.searchParams.get('currentJobId') || '') ? url.searchParams.get('currentJobId') : null);
  } catch { return null; }
}
export function postedAtFromText(text, now = new Date()) {
  const match = String(text).match(/\b(\d+)\s+(minute|hour|day|week)s?\s+ago\b/i);
  if (!match) return /\bjust now\b/i.test(text) ? now.toISOString() : null;
  const unit = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 }[match[2].toLowerCase()];
  return new Date(now.getTime() - Number(match[1]) * unit).toISOString();
}
export function externalApplyUrl(value, depth = 0) {
  if (depth > 3) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (/(^|\.)linkedin\.com$/i.test(url.hostname)) {
      const redirect = /^\/(?:redir\/redirect|safety\/go|jobs\/view\/externalApply)\/?$/i.test(url.pathname) ? url.searchParams.get('url') : null;
      return redirect ? externalApplyUrl(redirect, depth + 1) : null;
    }
    if (url.username || url.password || /^(?:localhost|0\.|10\.|127\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname) || /\.(?:localhost|local)$/i.test(url.hostname)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_.+|trk|trackingId|refId|eBP)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}
export function premiumSignals(text) {
  // Use only the primary LinkedIn card supplied by the collector, never the full page or Simplify.
  return {
    topApplicant: /you(?:’|')d be a top applicant|you are a top applicant|top applicant\s*[&·]/i.test(text),
    premiumMatch: /\bhigh match\b/i.test(text) ? 'high' : /\bmedium match\b/i.test(text) ? 'medium' : /\blow match\b/i.test(text) ? 'low' : null,
  };
}
export function comparePremiumCandidates(a, b) {
  return Number(Boolean(b.topApplicant)) - Number(Boolean(a.topApplicant)) || Number(b.premiumMatch === 'high') - Number(a.premiumMatch === 'high');
}
export function accessBlock(url, text, status = null) {
  if (status === 429 || /too many requests|rate limit exceeded|HTTP\s+(?:ERROR\s+)?429\b/i.test(text)) return { blockCode: 'rate_limited', reason: 'LinkedIn limited this scan (HTTP 429). It has stopped without retrying. Try again after the restriction clears.' };
  if (/quick security check|unusual activity|verify it'?s you|security verification|temporarily restricted|\/checkpoint/i.test(`${url}\n${text}`)) return { blockCode: 'account_check', reason: 'LinkedIn requires an account check in the discovery Chrome window.' };
  if (/\/authwall|\/login|\/uas\/login/i.test(url) || /join linkedin to view|sign in to view (?:this|the) job/i.test(text)) return { blockCode: 'login_required', reason: 'Sign in to LinkedIn in the dedicated discovery Chrome window.' };
  if (/^chrome-error:/i.test(url) || status >= 400) return { blockCode: 'network_error', reason: 'LinkedIn could not load in Chrome. Collection stopped; check the browser error before retrying.' };
  return null;
}
export function blockedReason(url, text) { return accessBlock(url, text)?.reason || null; }
async function accessCheck(page, status) {
  const text = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
  return accessBlock(page.url(), text.slice(0, 12000), status);
}
export async function inspectLinkedInSession(context) {
  // Read existing documents only. Do not create a tab, navigate, reload, inspect cookies, or clear state.
  const documents = [];
  for (const page of context.pages()) {
    if (!/https:\/\/(?:www\.)?linkedin\.com\/|^chrome-error:/i.test(page.url())) continue;
    const block = await accessCheck(page);
    if (block) return { status: 'blocked', ...block, checkedAt: new Date().toISOString(), navigationCount: 0, session: { authenticated: false, documents: documents.length + 1 } };
    const authenticated = await page.evaluate(() => Boolean(document.querySelector('.global-nav__me, .global-nav__primary-link-me-menu-trigger, a[href*="/mynetwork/"], button[aria-label*="Me"]'))).catch(() => false);
    documents.push({ authenticated });
  }
  const authenticated = documents.some(item => item.authenticated);
  return { status: authenticated ? 'ready' : 'unknown', reason: authenticated ? 'Signed-in LinkedIn navigation is visible. No requests were made.' : 'No signed-in LinkedIn document is visible. Open LinkedIn manually when access is available.', checkedAt: new Date().toISOString(), navigationCount: 0, session: { authenticated, documents: documents.length } };
}
export function extractSearchCardsDocument() {
  const root = document.querySelector('.jobs-search-results-list,.scaffold-layout__list,[data-testid="job-search-results-list"]')
    || (document.querySelector('main [componentkey^="job-card-component-ref-"]') && /\b\d+\+?\s+results\b/i.test(document.querySelector('main')?.textContent || '') ? document.querySelector('main') : null);
  const cardText = node => { const clone = node.cloneNode(true); clone.querySelectorAll('[id*="simplify"],[class*="simplify"],[hidden],[aria-hidden="true"]').forEach(child => child.remove()); return clone.textContent || ''; };
  if (!root) return [];
  const cards = [...root.querySelectorAll('[data-occludable-job-id],li[data-job-id],[componentkey^="job-card-component-ref-"]')];
  const rows = new Map();
  for (const card of cards) {
    const id = card.getAttribute('data-occludable-job-id') || card.getAttribute('data-job-id') || card.getAttribute('componentkey')?.match(/^job-card-component-ref-(\d+)$/)?.[1];
    if (/^\d{7,}$/.test(id || '')) rows.set(id, { id, text: cardText(card) });
  }
  // A bare detail page's recommended jobs are not search results.
  if (root) for (const anchor of root.querySelectorAll('a[href*="/jobs/view/"]')) {
    const id = anchor.pathname.match(/(?:\/|-)(\d{7,})\/?$/)?.[1];
    if (id && !rows.has(id)) rows.set(id, { id, text: cardText(anchor.closest('li') || anchor) });
  }
  return [...rows.values()];
}
export function extractLinkedInDocument() {
  const clean = value => (value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  const noise = '[id*="simplify"],[class*="simplify"],iframe,script,style,[hidden],[aria-hidden="true"],[class*="similar-jobs"],[class*="recommended-jobs"]';
  const safeText = node => {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll(noise).forEach(element => element.remove());
    return clean(clone.textContent);
  };
  // October 2026 search UI: job cards are component-key buttons, while the
  // selected job has its own linked title and a scoped lazy column.
  const selectedLink = [...document.querySelectorAll('main a[href*="/jobs/view/"]')].find(a => !a.closest('[componentkey^="job-card-component-ref-"]'));
  const componentRoot = selectedLink?.closest('[data-testid="lazy-column"]');
  const about = componentRoot && [...componentRoot.querySelectorAll('h2,h3')].find(h => clean(h.textContent) === 'About the job');
  if (componentRoot && about && selectedLink) {
    let body = about.parentElement;
    for (let depth = 0; body && body !== componentRoot && depth < 4 && safeText(body).length < 300; depth++) body = body.parentElement;
    const paragraphs = [...componentRoot.querySelectorAll('p')].filter(p => !p.closest(noise));
    const title = clean(selectedLink.textContent);
    const titleIndex = paragraphs.findIndex(p => p.contains(selectedLink));
    const company = titleIndex > 0 ? clean(paragraphs[titleIndex - 1].textContent) : '';
    const metadataText = clean(paragraphs[titleIndex + 1]?.textContent);
    const location = metadataText.split(/\s+[·•]\s+/)[0];
    let headerNode = selectedLink.parentElement;
    for (let depth = 0; headerNode?.parentElement && headerNode.parentElement !== componentRoot && depth < 10; depth++) headerNode = headerNode.parentElement;
    const header = headerNode && headerNode.innerText.length < 2000 ? clean(headerNode.innerText) + '\n' + [...headerNode.querySelectorAll('button,[role="button"]')].map(n => clean(n.textContent)).join('\n') : '';
    const controls = [...componentRoot.querySelectorAll('button,a[href]')].filter(n => !n.closest(noise));
    const apply = controls.find(n => /^(?:apply|apply now)$/i.test(clean(n.textContent)));
    const easy = controls.some(n => /^easy apply$/i.test(clean(n.textContent)));
    const premiumText = paragraphs.map(p => safeText(p)).find(t => /^(?:you.d be a top applicant|top applicant)(?:\b|$)/i.test(t)) || '';
    const description = body && body !== componentRoot ? clean(body.innerText).replace(/^About the job\s*/, '') : '';
    const detailId = selectedLink.getAttribute('href')?.match(/\/jobs\/view\/(\d+)/)?.[1];
    return { title, company, location, description, metadataText, premiumText, topText: header, contacts: [], detailId,
      salaryText: null,
      employmentType: /\bfull[ -]time\b/i.test(header) ? 'Full-time' : 'Not listed',
      workArrangement: /\bhybrid\b/i.test(header) ? 'Hybrid' : /\bon[ -]site\b/i.test(header) ? 'On-site' : /\bremote\b/i.test(header) ? 'Remote' : 'Not listed',
      applyHref: apply?.tagName === 'A' ? apply.href : null, applyMethod: easy && !apply ? 'easy_apply' : apply ? 'external' : 'unknown',
      selectors: { topCard: true, description: Boolean(description), metadata: Boolean(metadataText), path: 'component-column' },
    };
  }
  const titleElement = document.querySelector('.job-details-jobs-unified-top-card__job-title h1,.top-card-layout__title,h1');
  const top = titleElement?.closest('.job-details-jobs-unified-top-card__container,.jobs-unified-top-card,.top-card-layout,.topcard');
  const root = top?.closest('.jobs-details__main-content,.job-view-layout,main') || top;
  const metadata = top?.querySelector('.job-details-jobs-unified-top-card__primary-description-container,.topcard__flavor--bullet');
  const metadataText = clean(metadata?.innerText || top?.innerText);
  const title = clean(titleElement?.innerText);
  const company = clean(top?.querySelector('a[href*="/company/"],.job-details-jobs-unified-top-card__company-name,.topcard__org-name-link')?.innerText);
  const descriptionElement = (root || document).querySelector('#job-details,.jobs-description-content__text,.jobs-description__content,.show-more-less-html');
  const description = descriptionElement ? clean(descriptionElement.innerText) : '';
  const locationLine = metadataText.split('\n').map(clean).find(line => /,\s*(?:[A-Z]{2}|California)\b|United States|Remote|Hybrid|On-site/i.test(line)) || '';
  const location = locationLine.split(/\s+[·•]\s+/)[0];
  const topText = safeText(top);
  const primaryMatch = root?.querySelector('.job-details-how-you-match-card,[class*="premium-job"],[data-testid="premium-job-match"]');
  const premiumText = primaryMatch && !primaryMatch.closest(noise) ? safeText(primaryMatch) : '';
  const jobInsights = [...(top || document.createElement('div')).querySelectorAll('.job-details-jobs-unified-top-card__job-insight,.job-details-fit-level-preferences,.description__job-criteria-item')].map(node => clean(node.innerText)).join('\n');
  const detailsText = `${topText}\n${jobInsights}`;
  const outreachHeading = [...(root || document.createElement('div')).querySelectorAll('h2,h3,h4')].find(node => /^people you can reach out to$/i.test(clean(node.innerText)));
  let outreach = outreachHeading?.parentElement;
  for (let depth = 0; outreach && outreach !== root && depth < 2 && !outreach.querySelector('a[href*="/in/"]'); depth++) outreach = outreach.parentElement;
  const contacts = outreach && outreach !== root && (outreach.innerText || '').length < 6000 ? [...outreach.querySelectorAll('a[href*="/in/"]')].map(anchor => ({
    name: clean(anchor.innerText), profileUrl: anchor.href, context: clean(anchor.closest('li')?.innerText || anchor.parentElement?.innerText).slice(0, 400),
  })).filter(contact => contact.name && contact.name.length < 120 && /^https:\/\/(?:www\.)?linkedin\.com\/in\//i.test(contact.profileUrl)).slice(0, 5) : [];
  const controls = [...(top || document.createElement('div')).querySelectorAll('a[href],button')].filter(node => !node.closest(noise));
  const label = node => clean(node.innerText || node.getAttribute('aria-label'));
  const apply = controls.find(node => /^(?:apply|apply now)(?: to .+)?$/i.test(label(node)));
  const easyApply = controls.some(node => /easy apply/i.test(label(node)));
  const salaryText = topText.match(/\$\s*\d[\d,.]*\s*[kK]?(?:\s*\/(?:yr|year|hr|hour))?\s*(?:[-–—]|to)\s*\$?\s*\d[\d,.]*\s*[kK]?(?:\s*\/(?:yr|year|hr|hour))?/)?.[0] || null;
  return { title, company, location, description, metadataText, premiumText, topText, contacts, salaryText,
    employmentType: /\bfull[ -]time\b/i.test(detailsText) ? 'Full-time' : /\bpart[ -]time|contract|temporary|internship\b/i.test(detailsText) ? 'Other' : 'Not listed',
    workArrangement: /\bhybrid\b/i.test(detailsText) ? 'Hybrid' : /\bon[ -]site\b/i.test(detailsText) ? 'On-site' : /\bremote\b/i.test(detailsText) ? 'Remote' : 'Not listed',
    applyHref: apply?.tagName === 'A' ? apply.href : null, applyMethod: easyApply && !apply ? 'easy_apply' : apply ? 'external' : 'unknown',
    selectors: { topCard: Boolean(top), description: Boolean(descriptionElement), metadata: Boolean(metadata) },
  };
}
export async function extractPage(page) {
  await page.locator('#job-details,.jobs-description-content__text,.jobs-description__content,.show-more-less-html').first().waitFor({ timeout: 7000 }).catch(() => undefined);
  const expand = page.locator('#job-details,.jobs-description__content,.show-more-less-html').locator('button').filter({ hasText: /^(?:see|show) more$/i }).first();
  if (await expand.count()) await expand.click({ timeout: 2000 }).catch(() => undefined);
  return page.evaluate(extractLinkedInDocument);
}
async function resolveApply(page, raw, navigate) {
  const direct = externalApplyUrl(raw.applyHref);
  if (direct || raw.applyMethod !== 'external') return direct;
  const top = raw.selectors?.path === 'component-column' ? page.locator('[data-testid="lazy-column"]').filter({ has: page.getByRole('heading', { name: 'About the job', exact: true }) }).first() : page.locator('.job-details-jobs-unified-top-card__container,.jobs-unified-top-card,.top-card-layout,.topcard').first();
  const button = top.getByRole('button', { name: /^(?:apply|apply now)(?: to .+)?$/i }).first();
  if (!await button.count()) return null;
  await navigate(); // Apply opening consumes the same bounded navigation budget.
  const popupPromise = page.waitForEvent('popup', { timeout: 3500 }).catch(() => null);
  await button.click({ timeout: 2500 }).catch(() => undefined);
  const popup = await popupPromise;
  if (popup) {
    try {
      await popup.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => undefined);
      const block = await accessCheck(popup);
      if (block) throw Object.assign(new Error(block.reason), block);
      return externalApplyUrl(popup.url());
    } finally { await popup.close().catch(() => undefined); }
  }
  const block = await accessCheck(page);
  if (block) throw Object.assign(new Error(block.reason), block);
  return externalApplyUrl(page.url());
}
const DEFAULT_LOCK = fileURLToPath(new URL('../../../.runtime/linkedin-collector.lock', import.meta.url));
export async function acquireCollectorLock(lockPath = DEFAULT_LOCK) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }));
      await handle.close();
      return async () => {
        try {
          const current = JSON.parse(await readFile(lockPath, 'utf8'));
          if (current.token === token) await unlink(lockPath).catch(() => undefined);
        } catch { /* Never remove a lease whose ownership cannot be verified. */ }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let record;
      try { record = JSON.parse(await readFile(lockPath, 'utf8')); } catch {
        // A crash between exclusive creation and write leaves an empty lease.
        const info = await stat(lockPath).catch(() => null);
        if (!info || Date.now() - info.mtimeMs < 15 * 60_000) return null;
        await unlink(lockPath).catch(() => undefined); continue;
      }
      if (!Number.isInteger(record.pid) || record.pid <= 0) return null;
      try { process.kill(record.pid, 0); return null; }
      catch (failure) { if (failure.code !== 'ESRCH') return null; }
      await unlink(lockPath).catch(() => undefined);
    }
  }
  return null;
}
export function cooldownBlock(until, now = Date.now()) {
  if (!until) return null;
  const time = Date.parse(until);
  if (!Number.isFinite(time)) return { blockCode: 'invalid_configuration', reason: 'Invalid cooldown timestamp; collection stopped.' };
  return time > now ? { blockCode: 'cooldown', reason: `LinkedIn collection is cooling down until ${new Date(time).toISOString()}.`, retryAfter: new Date(time).toISOString() } : null;
}
async function runLinkedInCollection({ window = 'day', queries = SUPPORT_QUERIES, searchUrl = null, limit = 24, endpoint = 'http://127.0.0.1:9222', timeoutMs = 110_000, skipJobIds = [], jobIds = [], oneJob = null, sessionOnly = false, cooldownUntil = null, maxNavigations = 16, lockPath = DEFAULT_LOCK, browserConnector = (address) => chromium.connectOverCDP(address, { timeout: 5000 }), onProgress = () => {} } = {}) {
  const result = { status: 'completed', window, checked: 0, searches: [], jobs: [], diagnostics: [], navigationCount: 0, searchPages: 0, uniqueResultIds: 0, detailPages: 0, duplicatesAvoided: 0 };
  const stop = block => ({ ...result, status: 'blocked', ...block });
  if (!['day', 'week'].includes(window) || !Number.isFinite(timeoutMs) || !Number.isFinite(maxNavigations)) return stop({ blockCode: 'invalid_configuration', reason: 'Invalid collector window or request budget.' });
  const preferredSearch = searchUrl ? linkedInSearchForWindow(searchUrl, window) : null;
  if (searchUrl && !preferredSearch) return stop({ blockCode: 'invalid_configuration', reason: 'Saved LinkedIn search URL is invalid. No requests were made.' });
  const cooldown = cooldownBlock(cooldownUntil);
  if (!sessionOnly && cooldown) return stop(cooldown);
  if (oneJob && !/^\d{7,}$/.test(String(oneJob))) return stop({ blockCode: 'invalid_configuration', reason: 'One-job mode requires a numeric LinkedIn job ID.' });
  const release = sessionOnly ? async () => {} : await acquireCollectorLock(lockPath);
  if (!release) return stop({ blockCode: 'collector_busy', reason: 'Another LinkedIn collector is active. No new requests were made.' });
  let page, budgetTimer;
  const deadline = Date.now() + Math.max(10_000, Math.min(110_000, timeoutMs));
  const diagnostic = event => { result.diagnostics.push(event); onProgress(event); };
  let lastNavigationAt = 0;
  const navigate = async () => {
    if (result.navigationCount >= Math.min(30, Math.max(1, maxNavigations)) || Date.now() >= deadline - 5000) throw Object.assign(new Error('Scan request or time budget reached.'), { blockCode: 'budget_exhausted' });
    const delay = Math.max(0, 2500 - (Date.now() - lastNavigationAt));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastNavigationAt = Date.now(); result.navigationCount++;
  };
  try {
    let browser;
    try { browser = await browserConnector(endpoint); }
    catch { return stop({ blockCode: 'browser_unavailable', reason: 'The dedicated LinkedIn Chrome window is unavailable.' }); }
    const context = browser.contexts()[0];
    if (!context) return stop({ blockCode: 'browser_unavailable', reason: 'The discovery Chrome profile is unavailable.' });
    const session = await inspectLinkedInSession(context);
    if (sessionOnly) return { ...session, ...(cooldown ? { cooldown } : {}) };
    if (session.status === 'blocked') return stop({ blockCode: session.blockCode, reason: session.reason });
    if (!session.session.authenticated) return stop({ blockCode: 'login_required', reason: session.reason });
    page = await context.newPage();
    budgetTimer = setTimeout(() => { result.status = 'partial'; result.reason = 'Scan time budget reached.'; void page.close().catch(() => undefined); }, Math.max(1, deadline - Date.now()));
    const skipped = new Set(oneJob ? [] : skipJobIds.map(String));
    const seeds = oneJob ? [String(oneJob)] : jobIds.map(String);
    const observedIds = new Set(seeds.filter(id => /^\d{7,}$/.test(id)));
    result.uniqueResultIds = observedIds.size;
    result.seenJobIds = [...observedIds];
    result.duplicatesAvoided = seeds.filter(id => skipped.has(id)).length;
    const candidates = new Map(seeds.filter(id => /^\d{7,}$/.test(id) && !skipped.has(id)).map(id => [id, { id, topApplicant: false, premiumMatch: null, searchQueries: [], searchWindows: [] }]));
    const searchPlan = preferredSearch ? [{ query: new URL(preferredSearch).searchParams.get('keywords'), url: preferredSearch }] : queries.slice(0, 6).map(query => ({ query, url: buildSearchUrl(query, window) }));
    for (const { query, url } of (oneJob ? [] : searchPlan)) {
      if (Date.now() > deadline - 25_000) { result.status = 'partial'; result.reason = 'Scan time budget reached.'; break; }
      diagnostic({ stage: 'search', query, window });
      await navigate();
      result.searchPages++;
      let response;
      try { response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 }); }
      catch { const block = await accessCheck(page); if (block) return stop(block); result.status = 'partial'; result.searches.push({ query, url, status: 'failed', found: 0 }); continue; }
      const block = await accessCheck(page, response?.status());
      if (block) return stop(block);
      await page.locator('[data-occludable-job-id],.jobs-search-results-list a[href*="/jobs/view/"]').first().waitFor({ timeout: 5000 }).catch(() => undefined);
      const cards = await page.evaluate(extractSearchCardsDocument);
      for (const card of cards) {
        observedIds.add(card.id);
        result.uniqueResultIds = observedIds.size;
        result.seenJobIds = [...observedIds];
        if (skipped.has(card.id) || candidates.has(card.id)) result.duplicatesAvoided++;
        if (skipped.has(card.id)) continue;
        const existing = candidates.get(card.id) || { id: card.id, ...premiumSignals(card.text), searchQueries: [], searchWindows: [] };
        if (!existing.searchQueries.includes(query)) existing.searchQueries.push(query);
        if (!existing.searchWindows.includes(window)) existing.searchWindows.push(window);
        const visibleSignals = premiumSignals(card.text);
        existing.topApplicant ||= visibleSignals.topApplicant;
        const priority = { high: 3, medium: 2, low: 1 };
        if ((priority[visibleSignals.premiumMatch] || 0) > (priority[existing.premiumMatch] || 0)) existing.premiumMatch = visibleSignals.premiumMatch;
        candidates.set(card.id, existing);
      }
      result.searches.push({ query, url, status: cards.length ? 'ok' : 'empty', found: cards.length });
    }
    const ordered = [...candidates.values()].sort(comparePremiumCandidates).slice(0, oneJob ? 1 : Math.max(1, Math.min(40, Number(limit) || 24)));
    for (const candidate of ordered) {
      if (Date.now() > deadline - 20_000) { result.status = 'partial'; result.reason = 'Scan time budget reached.'; break; }
      const sourceUrl = `https://www.linkedin.com/jobs/view/${candidate.id}/`;
      diagnostic({ stage: 'detail', externalId: candidate.id, checked: result.checked, total: ordered.length });
      await navigate();
      result.detailPages++;
      const response = await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(async error => {
        const block = await accessCheck(page); if (block) throw Object.assign(new Error(block.reason), block); throw error;
      });
      const block = await accessCheck(page, response?.status());
      if (block) return stop(block);
      const raw = await extractPage(page);
      result.checked++;
      if (raw.detailId && raw.detailId !== candidate.id) {
        result.status = 'partial'; diagnostic({ stage: 'job_identity_mismatch', externalId: candidate.id, observedId: raw.detailId }); continue;
      }
      if (!raw.title || !raw.company || raw.description.length < 250) {
        result.status = 'partial'; diagnostic({ stage: 'incomplete_detail', externalId: candidate.id, selectors: raw.selectors, hasTitle: Boolean(raw.title), hasCompany: Boolean(raw.company), descriptionLength: raw.description.length }); continue;
      }
      const postedText = raw.metadataText.match(/(?:reposted\s+)?\d+\s+(?:minute|hour|day|week)s?\s+ago/i)?.[0] || '';
      const capturedAt = new Date().toISOString();
      const signals = premiumSignals(`${raw.topText}\n${raw.premiumText}`);
      const applyUrl = await resolveApply(page, raw, navigate);
      result.jobs.push({ externalId: candidate.id, sourceKey: 'linkedin:browser', sourceUrl, applyUrl, applyMethod: raw.applyMethod,
        company: raw.company, title: raw.title, location: raw.location, description: raw.description,
        employmentType: raw.employmentType, workArrangement: raw.workArrangement, salaryText: raw.salaryText, postedText,
        postedAt: postedAtFromText(postedText, new Date(capturedAt)), freshnessEvidence: postedText ? 'visible_relative_date' : 'unknown',
        searchWindows: candidate.searchWindows, searchQueries: candidate.searchQueries,
        contacts: raw.contacts, topApplicant: candidate.topApplicant || signals.topApplicant, premiumMatch: signals.premiumMatch || candidate.premiumMatch, capturedAt });
    }
    if (!result.jobs.length && !result.searches.some(search => search.found)) { result.status = 'partial'; result.reason = 'No complete jobs extracted. Inspect collector diagnostics.'; }
    return result;
  } catch (error) {
    diagnostic({ stage: 'collector_error', blockCode: error.blockCode || 'collector_error', message: error.message });
    return error.blockCode === 'budget_exhausted' ? { ...result, status: 'partial', reason: error.message } : stop({ blockCode: error.blockCode || 'collector_error', reason: error.message });
  } finally {
    clearTimeout(budgetTimer);
    await page?.close().catch(() => undefined);
    await release();
    // CDP belongs to the user. Do not browser.close(); CLI exit disconnects the client.
  }
}
/** Metrics describe attempted navigation pages and repeated/known IDs avoided, including blocked returns. */
export async function collectLinkedInSearch(options = {}) {
  const startedAt = Date.now();
  const defaults = { searchPages: 0, uniqueResultIds: 0, detailPages: 0, duplicatesAvoided: 0, navigationCount: 0 };
  try {
    const result = await runLinkedInCollection(options);
    return { ...defaults, ...result, durationMs: Math.max(0, Date.now() - startedAt) };
  } catch (error) {
    return { ...defaults, status: 'blocked', blockCode: error.blockCode || 'collector_error', reason: error.message, checked: 0, jobs: [], searches: [], diagnostics: [], durationMs: Math.max(0, Date.now() - startedAt) };
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const value = (key, fallback) => { const at = process.argv.indexOf(key); return at < 0 ? fallback : process.argv[at + 1] || fallback; };
  collectLinkedInSearch({ window: value('--window', 'day') === 'week' ? 'week' : 'day', limit: Number(value('--limit', '24')),
    sessionOnly: process.argv.includes('--session-only'), oneJob: value('--one-job', null), cooldownUntil: value('--cooldown-until', null),
    maxNavigations: Number(value('--max-navigations', '16')), searchUrl: value('--search-url', null),
    skipJobIds: value('--skip-job-ids', '').split(',').filter(Boolean), jobIds: value('--job-ids', '').split(',').filter(Boolean),
    onProgress: progress => process.stderr.write(`${JSON.stringify(progress)}\n`),
  }).then(result => { console.log(JSON.stringify(result)); process.exit(0); }).catch(error => {
    console.log(JSON.stringify({ status: 'blocked', blockCode: 'collector_error', checked: 0, jobs: [], searches: [], navigationCount: 0, reason: error.message })); process.exit(1);
  });
}
