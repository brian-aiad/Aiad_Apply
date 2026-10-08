import assert from 'node:assert/strict';
import test from 'node:test';
import { extractVerificationCode, selectNewestVerificationMessage, waitForVerificationCode } from '../../scripts/application-browser/gmail-verification.mjs';

const encoded = value => Buffer.from(value).toString('base64url');
const message = ({ id, to = 'Brian <brian@example.com>', from = 'no-reply@example.com', subject = 'Your verification code', body, receivedAt }) => ({
  id,
  internalDate: String(receivedAt),
  payload: {
    mimeType: 'text/plain',
    headers: [
      { name: 'To', value: to },
      { name: 'From', value: from },
      { name: 'Subject', value: subject },
    ],
    body: { data: encoded(body) },
  },
});

test('verification code extraction preserves capitalization and rejects ambiguous or uncontextualized values', () => {
  assert.equal(extractVerificationCode('Your verification code is aB12Cd.'), 'aB12Cd');
  assert.equal(extractVerificationCode('Use code: 123456 to continue.'), '123456');
  assert.equal(extractVerificationCode('Your password is 123456.'), null);
  assert.equal(extractVerificationCode('Your code is 123456. Verification code: AbCd12.'), null);
});

test('only the newest email for the exact employer, recipient, and request time can supply a code', () => {
  const requestedAt = Date.parse('2026-10-07T18:00:00.000Z');
  const emails = [
    message({ id: 'newest', body: 'We received your application to Example Company.', receivedAt: requestedAt + 5000 }),
    message({ id: 'older', body: 'Your verification code is Old123.', receivedAt: requestedAt + 3000 }),
    message({ id: 'wrong-recipient', to: 'other@example.com', body: 'Example Company verification code: Wrong1.', receivedAt: requestedAt + 6000 }),
    message({ id: 'wrong-employer', body: 'Other Company verification code: Wrong2.', receivedAt: requestedAt + 7000 }),
    message({ id: 'pre-request', body: 'Example Company verification code: Old456.', receivedAt: requestedAt - 1 }),
  ];
  const selected = selectNewestVerificationMessage(emails, {
    company: 'Example Company',
    recipient: 'brian@example.com',
    requestedAt,
  });
  assert.equal(selected.message.id, 'newest');
  assert.equal(extractVerificationCode(selected.body), null, 'must not fall back to an older code when the newest matching email has none');
});

test('Gmail lookup reads a new matching message and returns the code only to the caller', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const directory = await mkdtemp(path.join(tmpdir(), 'application-gmail-test-'));
  const credentialsPath = path.join(directory, 'oauth.json');
  await writeFile(credentialsPath, JSON.stringify({ clientId: 'test-client', clientSecret: 'test-secret', refreshToken: 'test-refresh' }), { mode: 0o600 });
  t.after(() => rm(directory, { recursive: true, force: true }));
  const requestedAt = Date.now();
  let searched = '';
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === 'oauth2.googleapis.com') return new Response(JSON.stringify({ access_token: 'test-access' }), { status: 200 });
    if (url.pathname.endsWith('/messages')) {
      searched = url.searchParams.get('q');
      return new Response(JSON.stringify({ messages: [{ id: 'message-1' }] }), { status: 200 });
    }
    if (url.pathname.endsWith('/messages/message-1')) {
      return new Response(JSON.stringify(message({
        id: 'message-1',
        body: 'Your Example Company verification code is Qr7AbC.',
        receivedAt: requestedAt + 1000,
      })), { status: 200 });
    }
    throw new Error(`Unexpected test request: ${options.method || 'GET'} ${url}`);
  };
  const code = await waitForVerificationCode({
    company: 'Example Company',
    recipient: 'brian@example.com',
    requestedAt,
    credentialsPath,
    fetchImpl,
  });
  assert.equal(code, 'Qr7AbC');
  assert.match(searched, /to:brian@example\.com/);
  assert.match(searched, /Example Company/);
  assert.match(searched, /after:/);
});
