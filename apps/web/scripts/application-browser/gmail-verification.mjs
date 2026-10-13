import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gmailApi = 'https://gmail.googleapis.com/gmail/v1/users/me';
const tokenApi = 'https://oauth2.googleapis.com/token';
const ocrScript = fileURLToPath(new URL('./gmail-screenshot-ocr.swift', import.meta.url));
const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const codePatterns = [
  /\buse\s+(?:this\s+)?code\s*[:#-]\s*([A-Za-z0-9]{4,10})\b/gi,
  /\b(?:verification|security|one[- ]time|confirmation|authentication|sign[- ]in|login)\s+code(?:\s+is)?\s*[:#-]?\s*([A-Za-z0-9]{4,10})\b/gi,
  /\b(?:your|the)\s+code\s+(?:is|:)\s*([A-Za-z0-9]{4,10})\b/gi,
  /\benter\s+(?:the\s+)?(?:following\s+)?code\s*[:#-]?\s*([A-Za-z0-9]{4,10})\b/gi,
];

function decodeBody(value) {
  return Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8');
}

function stripQuotedPlainText(value) {
  const lines = [];
  for (const line of value.split(/\r?\n/)) {
    if (/^\s*>/.test(line) || /^\s*-{2,}\s*(?:original|forwarded) message/i.test(line) || /^\s*On .{3,160}wrote:\s*$/i.test(line)) break;
    lines.push(line);
  }
  return lines.join('\n');
}

function textBody(payload) {
  const bodies = [];
  const visit = part => {
    if (part.body?.data && ['text/plain', 'text/html'].includes(part.mimeType)) {
      const body = decodeBody(part.body.data);
      bodies.push(part.mimeType === 'text/html'
        ? body.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, ' ').replace(/<div\b[^>]*class=["'][^"']*(?:gmail_quote|yahoo_quoted)[^"']*["'][^>]*>[\s\S]*$/i, ' ')
        : stripQuotedPlainText(body));
    }
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
const recipientAddresses = message => ['To', 'Cc', 'Delivered-To', 'X-Original-To']
  .flatMap(name => message.payload?.headers?.filter(item => item.name.toLowerCase() === name.toLowerCase()).flatMap(item => addresses(item.value)) || []);
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
    for (const match of String(text || '').matchAll(pattern)) {
      const hasExplicitSeparator = /[:#-]\s*[A-Z0-9]{4,10}\b$/i.test(match[0]);
      if (/\d/.test(match[1]) || hasExplicitSeparator) found.add(match[1]);
    }
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
        && recipientAddresses(message).includes(expectedRecipient)
        && mentionsCompany(message, company, body);
    })
    .sort((left, right) => Number(right.message.internalDate) - Number(left.message.internalDate));
  return matches[0] || null;
}

function inlineImageParts(payload, output = []) {
  if (allowedImageTypes.has(payload?.mimeType)) output.push(payload);
  for (const part of payload?.parts || []) inlineImageParts(part, output);
  return output;
}

async function messageImages(message, accessToken, fetchImpl) {
  const images = [];
  let totalBytes = 0;
  for (const part of inlineImageParts(message.payload).slice(0, 5)) {
    let encoded = part.body?.data;
    if (!encoded && part.body?.attachmentId) {
      const url = new URL(`${gmailApi}/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`);
      const response = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Gmail inline image retrieval failed (HTTP ${response.status}).`);
      encoded = (await response.json()).data;
    }
    if (!encoded || encoded.length > 3_000_000) continue;
    const data = Buffer.from(encoded.replaceAll('-', '+').replaceAll('_', '/'), 'base64');
    if (!data.length || data.length > 2_000_000 || totalBytes + data.length > 5_000_000) continue;
    totalBytes += data.length;
    images.push({ mimeType: part.mimeType, data });
  }
  return images;
}

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export async function captureEmailScreenshot(match, browserContext) {
  if (!browserContext?.newPage || !match?.message) throw new Error('The local Gmail screenshot fallback is unavailable.');
  const page = await browserContext.newPage();
  try {
    await page.setViewportSize({ width: 1200, height: 900 });
    const images = (match.images || []).map(image =>
      `<img alt="" src="data:${image.mimeType};base64,${image.data.toString('base64')}">`).join('');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body{font:20px/1.5 Arial,sans-serif;color:#111;background:#fff;margin:36px}
      main{max-width:1000px;margin:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:22px/1.6 Arial,sans-serif}
      img{display:block;max-width:900px;max-height:1200px;object-fit:contain;margin:24px 0}
    </style><main><pre>${escapeHtml(match.body.slice(0, 12000))}</pre>${images}</main>`, { waitUntil: 'load' });
    return await page.screenshot({ fullPage: true, type: 'png' });
  } finally {
    if (!page.isClosed()) await page.close();
  }
}

function runLocalOcr(executable, args, screenshot) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('Local screenshot OCR timed out.'));
    }, 90000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (output.length > 20000) {
        child.kill('SIGKILL');
        finish(new Error('Local screenshot OCR output exceeded its limit.'));
      }
    });
    child.once('error', error => finish(error));
    child.once('close', code => {
      if (code === 0) finish(null, output);
      else finish(new Error(`Local screenshot OCR exited with status ${code ?? 'unknown'}.`));
    });
    child.stdin.once('error', error => {
      if (error.code !== 'EPIPE') finish(error);
    });
    child.stdin.end(screenshot);
  });
}

export async function recognizeScreenshotText(screenshot) {
  if (!Buffer.isBuffer(screenshot) || screenshot.length === 0) throw new Error('The verification email screenshot was empty.');
  let visionError = null;
  if (process.platform === 'darwin') {
    try {
      return await runLocalOcr('swift', [ocrScript], screenshot);
    } catch (error) {
      visionError = error;
    }
  }
  try {
    return await runLocalOcr('tesseract', ['stdin', 'stdout', '--psm', '6'], screenshot);
  } catch (error) {
    const visionStatus = visionError?.code || (visionError ? 'failed' : 'not available');
    const tesseractStatus = error.code || 'failed';
    throw new Error(`Local email screenshot OCR failed (macOS Vision: ${visionStatus}; Tesseract: ${tesseractStatus}). No code was guessed.`);
  }
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
  listUrl.searchParams.set('includeSpamTrash', 'true');
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
  const match = selectNewestVerificationMessage(messages, { company, recipient, requestedAt });
  return match && {
    ...match,
    loadImages: () => messageImages(match.message, accessToken, fetchImpl),
  };
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
  browserContext,
  now = Date.now,
  sleep = pause,
}) {
  if (!company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recipient || ''))) {
    throw new Error('The application company or exact recipient email is unavailable; Gmail was not searched.');
  }
  const deadline = now() + timeoutMs;
  let sawMatchingMessage = false;
  const screenedMessages = new Set();
  while (now() < deadline) {
    const match = await getNewestMatchingMessage({ company, recipient, requestedAt, credentialsPath, fetchImpl });
    if (match) {
      sawMatchingMessage = true;
      const code = extractVerificationCode(match.body);
      if (code) return code;
      if (!screenedMessages.has(match.message.id)) {
        screenedMessages.add(match.message.id);
        const images = await match.loadImages();
        const screenshot = await captureEmailScreenshot({ ...match, images }, browserContext);
        const screenshotCode = extractVerificationCode(await recognizeScreenshotText(screenshot));
        if (screenshotCode) return screenshotCode;
      }
    }
    if (now() + intervalMs >= deadline) break;
    await sleep(intervalMs);
  }
  if (sawMatchingMessage) {
    throw new Error('A new email matching this employer, recipient, and verification request arrived, but it did not contain one unambiguous code. No older code was used.');
  }
  throw new Error('No new email matching this employer, recipient, and verification request arrived. Check Gmail, including Spam, or use the employer’s resend option; no older code was used.');
}
