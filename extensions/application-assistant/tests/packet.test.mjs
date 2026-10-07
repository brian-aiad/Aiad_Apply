import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validatePacket, matchesApplicationUrl } from '../packet.mjs';
const bytes = Buffer.from('%PDF-1.4\nfixture');
const packet = { format: 'aiadapply.application.v1', mode: 'review_before_submit', applicationId: 'app', runId: 'run', runNumber: 1, company: 'Fixture', title: 'Support', targetUrl: 'https://jobs.lever.co/company/123', preparedAt: new Date().toISOString(),
 contact: Object.fromEntries(['firstName','lastName','email','phone','city','region','postalCode','linkedin','portfolio'].map(key => [key, key])),
 resume: { fileName: 'resume.pdf', mimeType: 'application/pdf', base64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') } };
test('packet validates exact PDF bytes and expiry; unrecognized fields never travel', async () => {
  assert.equal((await validatePacket(packet)).resume.sha256, packet.resume.sha256);
  await assert.rejects(validatePacket({ ...packet, resume: { ...packet.resume, base64: Buffer.from('%PDF-tampered').toString('base64') } }), /fingerprint/);
  await assert.rejects(validatePacket(packet, Date.now()+73*3600000), /fresh packet/);
  await assert.rejects(validatePacket({ ...packet, mode: 'submit' }), /packet/);
  const clean = await validatePacket({ ...packet, contact: { ...packet.contact, password: 'secret', sponsorship: 'unknown' } });
  assert.equal('password' in clean.contact, false); assert.equal('sponsorship' in clean.contact, false);
});
test('job matching tolerates apply suffixes but never another job or portal', () => {
  const url = packet.targetUrl;
  assert.equal(matchesApplicationUrl(url, url+'/apply'), true);
  assert.equal(matchesApplicationUrl(url, url+'?utm_source=careers'), true);
  for (const actual of [url.replace('123','456'), url.replace('lever.co','lever.co.evil.test'), 'https://jobs.lever.co/company', url+'?jobId=456', url+'/apply/other']) assert.equal(matchesApplicationUrl(url, actual), false);
  assert.equal(matchesApplicationUrl('https://employer.test/apply?jobId=123', 'https://employer.test/apply?jobId=456'), false);
  assert.equal(matchesApplicationUrl('https://employer.test/', 'https://employer.test/'), false);
});
test('extension requests temporary active-page access without broad host permissions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.permissions, ['activeTab','scripting','storage']);
  assert.equal(manifest.host_permissions, undefined); assert.equal(manifest.content_scripts, undefined);
});
