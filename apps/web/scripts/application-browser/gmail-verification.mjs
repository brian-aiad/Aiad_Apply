import { readFile } from 'node:fs/promises';
import path from 'node:path';

const gmailApi = 'https://gmail.googleapis.com/gmail/v1/users/me';
const tokenApi = 'https://oauth2.googleapis.com/token';
const codePatterns = [
  /\buse\s+(?:this\s+)?code\s*[:#-]\s*([A-Za-z0-9]{4,10})\b/gi,
  /\b(?:verification|security|one[- ]time|confirmation|authentication|sign[- ]in|login)\s+code(?:\s+is)?\s*[:#-]?\s*([A-Za-z0-9]{4,10})\b/gi,
  /\b(?:your|the)\s+code\s+(?:is|:)\s*([A-Za-z0-9]{4,10})\b/gi,
  /\benter\s+(?:the\s+)?(?:following\s+)?code\s*[:#-]?\s*([A-Za-z0-9]{4,10})\b/gi,
];

function decodeBody(value) {
  return Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8');
}

function textBody(payload) {
  const bodies = [];
  const visit = part => {
    if (part.body?.data && ['text/plain', 'text/html'].includes(part.mimeType)) bodies.push(decodeBody(part.body.data));
    for (const child of part.parts || []) visit(child);
  };
  if (payload) visit(payload);
  return bodies.join('\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

const header = (message, name) => message.payload?.headers?.find(item => item.name.toLowerCase() === name.toLowerCase())?.value || '';
const addresses = value => [...value.matchAll(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(match => match[0].toLowerCase());
const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const mentionsCompany = (message, company, body) => {
  const target = normalized(company);
  if (!target) return false;
  return [header(message, 'From'), header(message, 'Subject'), body]
    .some(value => ` ${normalized(value)} `.includes(` ${target} `));
};

export function extractVerificationCode(text) {
  const found = new Set();
  for (const pattern of codePatterns) {
    pattern.lastIndex = 0;
    for (const match of String(text || '').matchAll(pattern)) found.add(match[1]);
  }
  return found.size === 1 ? [...found][0] : null;
}

export function selectNewestVerificationMessage(messages, { company, recipient, requestedAt }) {
  const cutoff = new Date(requestedAt).getTime();
  const expectedRecipient = String(recipient || '').trim().toLowerCase();
  const matches = messages.map(message => ({ message, body: textBody(message.payload) }))
    .filter(({ message, body }) => {
      const receivedAt = Number(message.internalDate);
      return Number.isFinite(receivedAt)
        && receivedAt >= cutoff
        && addresses(header(message, 'To')).includes(expectedRecipient)
        && mentionsCompany(message, company, body);
    })
    .sort((left, right) => Number(right.message.internalDate) - Number(left.message.internalDate));
  return matches[0] || null;
}

async function readCredentials(credentialsPath) {
  try {
    const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
    if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
      throw new Error('The saved Gmail OAuth connection is incomplete. Run npm run gmail:connect again.');
    }
    return credentials;
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Gmail OAuth is not connected. Run npm run gmail:connect to grant read-only access.');
    throw error;
  }
}

async function getAccessToken(credentials, fetchImpl) {
  const response = await fetchImpl(tokenApi, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Gmail OAuth token refresh failed (HTTP ${response.status}). Reconnect with npm run gmail:connect.`);
  const result = await response.json();
  if (!result.access_token) throw new Error('Gmail OAuth did not return an access token. Reconnect with npm run gmail:connect.');
  return result.access_token;
}

async function getNewestMatchingMessage({ company, recipient, requestedAt, credentialsPath, fetchImpl }) {
  const credentials = await readCredentials(credentialsPath);
  const accessToken = await getAccessToken(credentials, fetchImpl);
  const after = Math.floor(new Date(requestedAt).getTime() / 1000) - 1;
  const phrase = String(company).replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
  const query = `to:${recipient} after:${after} "${phrase}"`;
  const listUrl = new URL(`${gmailApi}/messages`);
  listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', '20');
  const listResponse = await fetchImpl(listUrl, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
  if (!listResponse.ok) throw new Error(`Gmail message search failed (HTTP ${listResponse.status}).`);
  const listed = await listResponse.json();
  const messages = [];
  for (const item of listed.messages || []) {
    const url = new URL(`${gmailApi}/messages/${encodeURIComponent(item.id)}`);
    url.searchParams.set('format', 'full');
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Gmail message retrieval failed (HTTP ${response.status}).`);
    messages.push(await response.json());
  }
  return selectNewestVerificationMessage(messages, { company, recipient, requestedAt });
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function waitForVerificationCode({
  company,
  recipient,
  requestedAt,
  credentialsPath = path.resolve(process.cwd(), '../../.runtime/application-gmail-oauth.json'),
  fetchImpl = fetch,
  timeoutMs = 120000,
  intervalMs = 5000,
  now = Date.now,
  sleep = pause,
}) {
  if (!company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recipient || ''))) {
    throw new Error('The application company or exact recipient email is unavailable; Gmail was not searched.');
  }
  const deadline = now() + timeoutMs;
  let sawMatchingMessage = false;
  while (now() < deadline) {
    const match = await getNewestMatchingMessage({ company, recipient, requestedAt, credentialsPath, fetchImpl });
    if (match) {
      sawMatchingMessage = true;
      const code = extractVerificationCode(match.body);
      if (code) return code;
    }
    if (now() + intervalMs >= deadline) break;
    await sleep(intervalMs);
  }
  if (sawMatchingMessage) {
    throw new Error('A new email matching this employer, recipient, and verification request arrived, but it did not contain one unambiguous code. No older code was used.');
  }
  throw new Error('No new email matching this employer, recipient, and verification request arrived. Check Gmail, including Spam, or use the employer’s resend option; no older code was used.');
}
