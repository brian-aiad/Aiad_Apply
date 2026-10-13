import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchUrl, linkedinJobId, postedAtFromText, externalApplyUrl, premiumSignals, SUPPORT_QUERIES, blockedReason } from '../../scripts/linkedin-discovery.mjs';

test('discovery searches daily and weekly full-time envelopes around Seal Beach', () => {
  const daily = new URL(buildSearchUrl('Technical Support', 'day'));
  const weekly = new URL(buildSearchUrl('Technical Support', 'week'));
  assert.equal(daily.searchParams.get('f_TPR'), 'r86400');
  assert.equal(weekly.searchParams.get('f_TPR'), 'r604800');
  assert.equal(daily.searchParams.get('f_JT'), 'F');
  assert.equal(daily.searchParams.get('keywords'), 'Technical Support');
  assert.match(daily.searchParams.get('location'), /Seal Beach/);
  assert.equal(SUPPORT_QUERIES.length, 6);
});
test('canonical identity ignores LinkedIn tracking and preserves explicit selected job ID', () => {
  assert.equal(linkedinJobId('https://www.linkedin.com/jobs/search-results/?currentJobId=4458415638&trackingId=other'), '4458415638');
  assert.equal(linkedinJobId('https://www.linkedin.com/jobs/view/support-engineer-at-mortgage-office-4475174359/'), '4475174359');
  assert.equal(linkedinJobId('https://evil.test/jobs/view/4475174359/'), null);
});
test('visible relative dates retain day/week precision and unknown stays unknown', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  assert.equal(postedAtFromText('Reposted 2 days ago', now), '2026-10-10T12:00:00.000Z');
  assert.equal(postedAtFromText('1 week ago', now), '2026-10-05T12:00:00.000Z');
  assert.equal(postedAtFromText('Actively hiring', now), null);
});
test('external employer destination rejects LinkedIn Easy Apply and non-web URLs', () => {
  assert.equal(externalApplyUrl('https://www.linkedin.com/jobs/view/4458415638/'), null);
  assert.equal(externalApplyUrl('javascript:alert(1)'), null);
  assert.equal(externalApplyUrl('http://127.0.0.1:3000'), null);
  assert.equal(externalApplyUrl('https://www.linkedin.com/redir/redirect?url=https%3A%2Fcareers.example.com%2Fjob%2F123'), 'https://careers.example.com/job/123');
});
test('Premium labels remain auxiliary signals, not fit or eligibility assertions', () => {
  assert.deepEqual(premiumSignals('You’d be a top applicant'), { topApplicant: true, premiumMatch: null });
  assert.deepEqual(premiumSignals('Medium match'), { topApplicant: false, premiumMatch: 'medium' });
  assert.deepEqual(premiumSignals('2 of 8 keywords matched'), { topApplicant: false, premiumMatch: null });
});

 test('Chrome HTTP 429 error pages stop collection rather than masquerading as empty jobs', () => {
  assert.match(blockedReason('chrome-error://chromewebdata/', 'This page isn’t working HTTP ERROR 429 Reload'), /429/);
  assert.match(blockedReason('https://www.linkedin.com/jobs/', 'Too many requests'), /stopped without retrying/);
  assert.match(blockedReason('chrome-error://chromewebdata/', 'Network unavailable'), /could not load/);
  assert.equal(blockedReason('https://www.linkedin.com/jobs/view/4458415638/', 'Application Support Consultant'), null);
});
