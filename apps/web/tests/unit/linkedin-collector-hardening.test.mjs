import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { extractLinkedInDocument, extractSearchCardsDocument, premiumSignals, accessBlock, inspectLinkedInSession, acquireCollectorLock, collectLinkedInSearch, externalApplyUrl, comparePremiumCandidates, SUPPORT_QUERIES } from '../../scripts/linkedin-discovery.mjs';

const fixture = name => readFile(new URL(`../fixtures/linkedin/${name}.html`, import.meta.url), 'utf8');

test('cooldown and invalid one-job IDs stop before browser access', async () => {
  const result = await collectLinkedInSearch({ cooldownUntil: '2999-01-01T00:00:00Z', endpoint: 'http://invalid.invalid' });
  assert.equal(result.blockCode, 'cooldown'); assert.equal(result.navigationCount, 0);
  for (const key of ['searchPages', 'uniqueResultIds', 'detailPages', 'duplicatesAvoided']) assert.equal(result[key], 0);
  assert.ok(result.durationMs >= 0);
  assert.equal((await collectLinkedInSearch({ oneJob: '../bad' })).blockCode, 'invalid_configuration');
});

test('local collector lease cannot overlap and release does not delete another owner', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'linkedin-lock-test-'));
  const file = path.join(dir, 'lease');
  try {
    const release = await acquireCollectorLock(file);
    assert.equal(typeof release, 'function');
    assert.equal(await acquireCollectorLock(file), null);
    await writeFile(file, JSON.stringify({ pid: process.pid, token: 'another-owner' }));
    await release();
    assert.equal(JSON.parse(await readFile(file, 'utf8')).token, 'another-owner');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('session check reads existing documents only and preserves rate-limit state', async () => {
  let reads = 0;
  const context = { pages: () => [{ url: () => 'chrome-error://chromewebdata/', locator: () => ({ innerText: async () => { reads++; return 'HTTP ERROR 429'; } }) }] };
  const result = await inspectLinkedInSession(context);
  assert.equal(result.blockCode, 'rate_limited'); assert.equal(result.navigationCount, 0); assert.equal(reads, 1);
  const ready = await inspectLinkedInSession({ pages: () => [{ url: () => 'https://www.linkedin.com/jobs/', locator: () => ({ innerText: async () => 'Jobs Home' }), evaluate: async () => true }] });
  assert.equal(ready.status, 'ready'); assert.equal(ready.navigationCount, 0);
});

test('structured access blocks distinguish login, challenge, 429 and server failure', () => {
  assert.equal(accessBlock('https://www.linkedin.com/login', 'Sign in').blockCode, 'login_required');
  assert.equal(accessBlock('https://www.linkedin.com/checkpoint/', '').blockCode, 'account_check');
  assert.equal(accessBlock('https://www.linkedin.com/jobs/', '', 429).blockCode, 'rate_limited');
  assert.equal(accessBlock('https://www.linkedin.com/jobs/', '', 503).blockCode, 'network_error');
  assert.equal(externalApplyUrl('http://172.16.0.1/jobs'), null);
  assert.equal(externalApplyUrl('https://user:secret@example.com/jobs'), null);
});

test('sanitized LinkedIn HTML fixtures preserve primary-job scope without external requests', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  let requests = 0;
  await context.route('**/*', route => { requests++; return route.abort(); });
  const page = await context.newPage();
  try {
    await page.setContent(await fixture('search-component-cards'));
    const componentCards = await page.evaluate(extractSearchCardsDocument);
    assert.deepEqual(componentCards.map(card => card.id), ['1234567890', '1234567891']);
    assert.equal(premiumSignals(componentCards[0].text).topApplicant, true);
    assert.doesNotMatch(componentCards[0].text, /Low Match/);
    await page.setContent(await fixture('detail-component-column'));
    const componentDetail = await page.evaluate(extractLinkedInDocument);
    assert.equal(componentDetail.detailId, '1234567890');
    assert.equal(componentDetail.company, 'Example Employer');
    assert.equal(componentDetail.location, 'Irvine, CA');
    assert.equal(componentDetail.employmentType, 'Full-time');
    assert.equal(componentDetail.workArrangement, 'Hybrid');
    assert.equal(componentDetail.applyMethod, 'easy_apply');
    assert.equal(premiumSignals(componentDetail.premiumText).topApplicant, true);
    assert.doesNotMatch(componentDetail.description, /Unrelated company marketing|Unrelated card/);
    assert.ok(componentDetail.description.length > 300);
    await page.setContent(await fixture('detail-external'));
    const external = await page.evaluate(extractLinkedInDocument);
    assert.equal(external.title, 'Application Support Consultant');
    assert.equal(external.company, 'Example Diagnostics');
    assert.equal(external.location, 'Brea, CA');
    assert.equal(external.employmentType, 'Full-time');
    assert.equal(external.salaryText, '$85K/yr – $95K/yr');
    assert.equal(external.workArrangement, 'On-site');
    assert.equal(external.applyMethod, 'external');
    assert.equal(external.applyHref, 'https://careers.example.com/jobs/R123?source=linkedin');
    assert.deepEqual(premiumSignals(external.topText + '\n' + external.premiumText), { topApplicant: false, premiumMatch: 'medium' });
    assert.equal(external.contacts.length, 1); assert.equal(external.contacts[0].name, 'Jordan Example');
    assert.ok(external.description.length > 250); assert.doesNotMatch(external.description, /Wrong Person|Unrelated role/);
    await page.setContent(await fixture('detail-easy'));
    const easy = await page.evaluate(extractLinkedInDocument);
    assert.equal(easy.applyMethod, 'easy_apply'); assert.equal(easy.applyHref, null);
    assert.deepEqual(premiumSignals(easy.topText + '\n' + easy.premiumText), { topApplicant: true, premiumMatch: null });
    await page.setContent(await fixture('search'));
    assert.deepEqual((await page.evaluate(extractSearchCardsDocument)).map(row => row.id), ['4458415638', '4475174359']);
    await page.setContent(await fixture('rate-limited'));
    assert.equal(accessBlock('chrome-error://chromewebdata/', await page.locator('body').innerText()).blockCode, 'rate_limited');
    assert.equal(requests, 0);
  } finally { await browser.close(); }
});


test('one-job mode extracts exactly one fixture and never searches or clicks Easy Apply', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'linkedin-one-job-'));
  let requests = 0, navigations = 0, clicks = 0;
  await context.route('**/*', route => { requests++; return route.abort(); });
  const localPage = await context.newPage();
  let logicalUrl = 'about:blank';
  const fixturePage = {
    goto: async url => { navigations++; logicalUrl = url; await localPage.setContent(await fixture('detail-easy')); return { status: () => 200 }; },
    url: () => logicalUrl,
    locator: (...args) => localPage.locator(...args),
    evaluate: (...args) => localPage.evaluate(...args),
    close: () => localPage.close(),
    getByRole: () => ({ click: () => { clicks++; throw new Error('Unexpected click'); } }),
  };
  const signedIn = { url: () => 'https://www.linkedin.com/jobs/', locator: () => ({ innerText: async () => 'Jobs' }), evaluate: async () => true };
  try {
    const result = await collectLinkedInSearch({ oneJob: '4458415638', lockPath: path.join(dir, 'lease'),
      browserConnector: async () => ({ contexts: () => [{ pages: () => [signedIn], newPage: async () => fixturePage }] }),
    });
    assert.equal(result.status, 'completed'); assert.equal(result.jobs.length, 1);
    assert.equal(result.searches.length, 0); assert.equal(result.navigationCount, 1);
    assert.equal(result.jobs[0].applyMethod, 'easy_apply'); assert.equal(result.jobs[0].applyUrl, null);
    assert.deepEqual(result.jobs[0].searchWindows, []);
    assert.equal(result.jobs[0].freshnessEvidence, 'visible_relative_date');
    assert.equal(result.searchPages, 0); assert.equal(result.detailPages, 1); assert.equal(result.uniqueResultIds, 1); assert.equal(result.duplicatesAvoided, 0); assert.ok(result.durationMs >= 0);
    assert.equal(navigations, 1); assert.equal(clicks, 0); assert.equal(requests, 0);
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
});

test('session-only collector cannot navigate or clear an existing cooldown', async () => {
  let newPages = 0;
  const signedIn = { url: () => 'https://www.linkedin.com/jobs/', locator: () => ({ innerText: async () => 'Jobs' }), evaluate: async () => true };
  const result = await collectLinkedInSearch({ sessionOnly: true, cooldownUntil: '2999-01-01T00:00:00Z',
    browserConnector: async () => ({ contexts: () => [{ pages: () => [signedIn], newPage: async () => { newPages++; throw new Error('Must not create a page'); } }] }),
  });
  assert.equal(result.status, 'ready'); assert.equal(result.navigationCount, 0);
  assert.equal(result.cooldown.blockCode, 'cooldown'); assert.equal(newPages, 0);
  assert.equal(result.searchPages, 0); assert.equal(result.detailPages, 0); assert.ok(result.durationMs >= 0);
});


test('external redirect unwrapping accepts only known LinkedIn redirect paths and preserves requisitions', () => {
  assert.equal(externalApplyUrl('https://www.linkedin.com/jobs/view/4458415638/?url=https%3A%2Fwrong.example.com'), null);
  assert.equal(externalApplyUrl('https://www.linkedin.com/redir/redirect?url=https%3A%2Fcareers.example.com%2Fjob%3Freq%3DR123%26utm_source%3Dlinkedin%23apply'), 'https://careers.example.com/job?req=R123');
});


test('six grouped searches cover adjacent support families and prioritize Top then High cards', () => {
  assert.equal(SUPPORT_QUERIES.length, 6);
  assert.match(SUPPORT_QUERIES.join(' '), /Production Support/);
  assert.match(SUPPORT_QUERIES.join(' '), /Product Support/);
  assert.match(SUPPORT_QUERIES.join(' '), /Integration Support/);
  assert.match(SUPPORT_QUERIES.join(' '), /Platform Support/);
  const cards = [{ id: 'unknown', topApplicant: false, premiumMatch: null }, { id: 'high', topApplicant: false, premiumMatch: 'high' }, { id: 'top', topApplicant: true, premiumMatch: null }];
  assert.deepEqual(cards.sort(comparePremiumCandidates).map(card => card.id), ['top', 'high', 'unknown']);
});

test('preferred search drives collection instead of generic queries, using only offline fixtures', async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'linkedin-preferred-'));
  const visited = [];
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  let logicalUrl = 'about:blank';
  const fixturePage = {
    goto: async url => { visited.push(url); logicalUrl = url; await page.setContent(await fixture(url.includes('/search') ? 'search' : 'detail-easy')); return { status: () => 200 }; },
    url: () => logicalUrl, locator: (...args) => page.locator(...args), evaluate: (...args) => page.evaluate(...args), close: () => page.close(),
  };
  const signedIn = { url: () => 'https://www.linkedin.com/jobs/', locator: () => ({ innerText: async () => 'Jobs' }), evaluate: async () => true };
  try {
    const result = await collectLinkedInSearch({ window: 'day', limit: 1, searchUrl: 'https://www.linkedin.com/jobs/search-results/?keywords=Application+Support+Engineer&geoId=104234982&distance=35&f_TPR=r604800&f_SAL=chosen-band', lockPath: path.join(dir, 'lease'),
      browserConnector: async () => ({ contexts: () => [{ pages: () => [signedIn], newPage: async () => fixturePage }] }),
    });
    assert.equal(result.status, 'completed'); assert.equal(result.searches.length, 1); assert.equal(result.jobs.length, 1);
    const search = new URL(visited[0]);
    assert.equal(search.pathname, '/jobs/search-results/'); assert.equal(search.searchParams.get('keywords'), 'Application Support Engineer');
    assert.equal(search.searchParams.get('f_SAL'), 'chosen-band'); assert.equal(search.searchParams.get('geoId'), '104234982');
    assert.equal(search.searchParams.get('f_TPR'), 'r86400'); assert.equal(visited.length, 2);
  } finally { await browser.close(); await rm(dir, { recursive: true, force: true }); }
});
