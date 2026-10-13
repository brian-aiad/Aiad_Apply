import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { extractSearchCardsDocument, extractLinkedInDocument, premiumSignals, linkedinJobId, postedAtFromText } from './linkedin-discovery.mjs';
import { normalizeLinkedInSearch } from '../src/lib/discovery/linkedin-search.mjs';

// Explicit user-assisted capture. No navigation, retries, cookies, profile copying,
// or alteration of the collector's rate-limit/session state.
export async function captureOpenSearch() {
  const { stdout } = await promisify(execFile)('python3', [fileURLToPath(new URL('./capture-open-linkedin.py', import.meta.url))], { timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  const input = JSON.parse(stdout);
  const searchUrl = normalizeLinkedInSearch(input.url);
  if (!searchUrl) throw new Error('The open tab is not a supported LinkedIn search.');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(input.html, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const cards = await page.evaluate(extractSearchCardsDocument);
    // Keep only job-card content, never profile navigation, messages or raw HTML.
    const jobs = await page.evaluate(() => [...document.querySelectorAll('main [componentkey^="job-card-component-ref-"]')].map(card => {
      const paragraphs = [...card.querySelectorAll('p')].map(p => {
        const clone = p.cloneNode(true);
        clone.querySelectorAll('[aria-hidden="true"]').forEach(e => e.remove());
        return (clone.textContent || '').trim();
      }).filter(Boolean);
      return { id: card.getAttribute('componentkey').replace('job-card-component-ref-', ''), title: (paragraphs[0] || '').replace(/^Selected,\s*/, '').replace(/\s*\(Verified job\)$/, '').trim(), company: paragraphs[1] || '', location: paragraphs[2] || '' };
    }));
    const normalized = cards.map(card => ({ ...jobs.find(j => j.id === card.id), id: card.id, text: card.text.slice(0, 2000), ...premiumSignals(card.text), sourceUrl: `https://www.linkedin.com/jobs/view/${card.id}/` })).filter(card => card.title && card.company && card.location);
    if (!normalized.length) throw new Error('The open search layout could not be read. No jobs were imported.');
    const detail = await page.evaluate(extractLinkedInDocument);
    const expected = linkedinJobId(input.url);
    const selectedJob = expected && detail.detailId === expected && detail.title && detail.company && detail.location && detail.description.length >= 300
      ? { ...detail, externalId: expected, sourceUrl: `https://www.linkedin.com/jobs/view/${expected}/`, ...premiumSignals(detail.premiumText), postedAt: postedAtFromText(detail.metadataText), extractionMethod: 'user-open-page-snapshot' } : null;
    return { searchUrl, capturedAt: new Date().toISOString(), method: 'user-open-page-snapshot', navigationCount: 0, cards: normalized.slice(0, 100), selectedJob };
  } finally { await browser.close(); }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  captureOpenSearch().then(result => process.stdout.write(JSON.stringify(result))).catch(error => { process.stderr.write(error.message); process.exitCode = 1; });
}
