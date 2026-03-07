import crypto from 'node:crypto';

export function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function buildAuthorizationUrl({ clientId, redirectUri, state, codeChallenge, scopes, oauthBaseUrl }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: scopes.join(' '),
  });
  const base = oauthBaseUrl
    ? `${oauthBaseUrl}/oauth2/authorize`
    : 'https://twitter.com/i/oauth2/authorize';
  return `${base}?${params.toString()}`;
}

export async function exchangeCodeForToken({ clientId, clientSecret, code, redirectUri, codeVerifier, apiBaseUrl }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: clientId,
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  // If client secret is provided, use Basic auth (confidential client)
  if (clientSecret) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }

  const tokenUrl = apiBaseUrl
    ? `${apiBaseUrl}/2/oauth2/token`
    : 'https://api.twitter.com/2/oauth2/token';

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${res.status} ${err.error_description || err.error || ''}`);
  }

  return res.json();
}

export async function refreshAccessToken({ clientId, clientSecret, refreshToken, apiBaseUrl }) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  if (clientSecret) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  }

  const tokenUrl = apiBaseUrl
    ? `${apiBaseUrl}/2/oauth2/token`
    : 'https://api.twitter.com/2/oauth2/token';

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Token refresh failed: ${res.status} ${err.error_description || err.error || ''}`);
  }

  return res.json();
}

export async function getAuthenticatedUser(accessToken, { apiBaseUrl } = {}) {
  const userUrl = apiBaseUrl
    ? `${apiBaseUrl}/2/users/me`
    : 'https://api.twitter.com/2/users/me';

  const res = await fetch(userUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Failed to get user: ${res.status} ${err.detail || ''}`);
  }

  const data = await res.json();
  return { username: data.data.username };
}
