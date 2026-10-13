import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLinkedInSearch, linkedInSearchForWindow } from '../../src/lib/discovery/linkedin-search.mjs';
import { collectLinkedInSearch } from '../../scripts/linkedin-discovery.mjs';

const source = 'https://www.linkedin.com/jobs/search-results/?currentJobId=4458415638&eBP=private-tracking&keywords=Application%20Support%20Engineer&geoId=104234982&distance=35&f_TPR=r604800&f_SAL=f_SA_id_226001%3A272015&f_JT=F&sortBy=R&start=25';
test('saved search retains actual filters and removes selected-job, pagination and attribution', () => {
  const url = new URL(normalizeLinkedInSearch(source));
  assert.equal(url.pathname, '/jobs/search-results/');
  for (const key of ['keywords', 'geoId', 'distance', 'f_SAL', 'f_JT', 'sortBy']) assert.equal(url.searchParams.get(key), new URL(source).searchParams.get(key));
  for (const key of ['currentJobId', 'eBP', 'start']) assert.equal(url.searchParams.has(key), false);
  const day = new URL(linkedInSearchForWindow(source, 'day'));
  assert.equal(day.searchParams.get('f_TPR'), 'r86400');
  day.searchParams.set('f_TPR', 'r604800');
  assert.equal(day.href, linkedInSearchForWindow(source, 'week'));
});
test('only HTTPS LinkedIn search pages with keywords may be saved', async () => {
  for (const bad of ['http://www.linkedin.com/jobs/search/?keywords=IT', 'https://linkedin.com.evil.test/jobs/search/?keywords=IT', 'https://www.linkedin.com/jobs/view/4458415638/', 'https://www.linkedin.com/jobs/search/', 'https://user:secret@linkedin.com/jobs/search/?keywords=IT']) assert.equal(normalizeLinkedInSearch(bad), null);
  let connected = false;
  const result = await collectLinkedInSearch({ searchUrl: 'https://localhost/search', browserConnector: () => { connected = true; throw new Error('Must not connect'); } });
  assert.equal(result.blockCode, 'invalid_configuration'); assert.equal(connected, false);
});
