import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.resolve(webRoot, '../..');
config({ path: path.join(webRoot, '.env.local'), quiet: true });
config({ path: path.join(webRoot, '.env'), quiet: true });

const clientFile = process.env.GOOGLE_OAUTH_CLIENT_FILE;
if (!clientFile) throw new Error('Set GOOGLE_OAUTH_CLIENT_FILE to your Google OAuth Desktop client JSON file.');
const clientDocument = JSON.parse(await readFile(path.resolve(clientFile), 'utf8'));
const client = clientDocument.installed;
if (!client?.client_id || !client.client_secret) throw new Error('The OAuth client file must contain a Google Desktop app client.');

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(24).toString('base64url');
const server = createServer();
const scope = 'https://www.googleapis.com/auth/gmail.readonly';
let redirectUri = '';

const result = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    server.close();
    reject(new Error('Gmail OAuth setup timed out. Run npm run gmail:connect to try again.'));
  }, 180000);
  server.on('request', async (request, response) => {
    const callback = new URL(request.url || '/', redirectUri);
    if (callback.pathname !== '/') {
      response.writeHead(404).end();
      return;
    }
    if (callback.searchParams.get('state') !== state) {
      response.writeHead(400).end('OAuth state verification failed. Close this page and retry the connection.');
      return;
    }
    if (callback.searchParams.has('error')) {
      response.writeHead(400).end('Gmail access was not authorized. You can close this page.');
      clearTimeout(timeout);
      server.close();
      reject(new Error('Gmail read-only access was not authorized.'));
      return;
    }
    const authorizationCode = callback.searchParams.get('code');
    if (!authorizationCode) {
      response.writeHead(400).end('Google did not return an authorization code.');
      clearTimeout(timeout);
      server.close();
      reject(new Error('Google OAuth did not return an authorization code.'));
      return;
    }
    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: authorizationCode,
          client_id: client.client_id,
          client_secret: client.client_secret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!tokenResponse.ok) throw new Error(`Google OAuth token exchange failed (HTTP ${tokenResponse.status}).`);
      const tokens = await tokenResponse.json();
      if (!tokens.refresh_token) throw new Error('Google did not issue a refresh token. Revoke the app grant and run the connection again.');
      const runtime = path.join(root, '.runtime');
      const credentialsPath = path.join(runtime, 'application-gmail-oauth.json');
      await mkdir(runtime, { recursive: true, mode: 0o700 });
      await chmod(runtime, 0o700);
      const temporaryPath = `${credentialsPath}.${randomBytes(8).toString('hex')}.tmp`;
      await writeFile(temporaryPath, JSON.stringify({
        clientId: client.client_id,
        clientSecret: client.client_secret,
        refreshToken: tokens.refresh_token,
        scope,
      }), { mode: 0o600, flag: 'wx' });
      try {
        await rename(temporaryPath, credentialsPath);
      } catch (error) {
        await unlink(temporaryPath);
        throw error;
      }
      await chmod(credentialsPath, 0o600);
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('Gmail read-only access is connected. You can close this page.');
      clearTimeout(timeout);
      resolve(credentialsPath);
    } catch (error) {
      response.writeHead(500).end('Gmail could not be connected. Check the local setup output and try again.');
      clearTimeout(timeout);
      server.close();
      reject(error);
    }
  });
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    redirectUri = `http://127.0.0.1:${address.port}/`;
    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizationUrl.search = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    console.log('Open this URL to grant read-only Gmail access. No paid API is used:');
    console.log(authorizationUrl.toString());
  });
});

await new Promise(resolve => server.close(resolve));
console.log(`Gmail OAuth credentials saved locally with owner-only permissions: ${result}`);
