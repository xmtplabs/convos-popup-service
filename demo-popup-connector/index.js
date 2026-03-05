import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Token cache
let cachedToken = null;
let tokenExpiresAt = 0;
let clientId = null;
let clientSecret = null;

async function getAccessToken() {
  // Refresh at 80% of TTL
  if (cachedToken && Date.now() < tokenExpiresAt * 0.8 + Date.now() * 0.2) {
    // Simple check: if more than 80% of lifetime remains, reuse
    if (Date.now() < tokenExpiresAt - 720 * 1000) {
      return cachedToken;
    }
  }

  if (!clientId || !clientSecret) {
    throw new Error('Not registered yet. POST /register first.');
  }

  const res = await fetch(`${config.popupServiceUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${res.status} ${body.error || ''}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

// GET /health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', registered: !!clientId });
});

// POST /register — register with popup service
app.post('/register', async (req, res) => {
  try {
    const regRes = await fetch(`${config.popupServiceUrl}/connect/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespace: config.namespace,
        displayName: config.displayName,
        verificationEndpoint: `http://localhost:${config.port}/verify`,
        appIconUrl: 'https://placehold.co/400.png',
        contactEmail: config.contactEmail,
      }),
    });

    const body = await regRes.json();
    if (regRes.ok || regRes.status === 202) {
      clientId = body.clientId;
      clientSecret = body.clientSecret;
      res.json(body);
    } else {
      res.status(regRes.status).json(body);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /verify — verification form (user-facing)
app.get('/verify', (req, res) => {
  const { invite_id, callback, namespace } = req.query;
  res.render('verify', {
    invite_id: invite_id || '',
    callback: callback || '',
    namespace: namespace || config.namespace,
  });
});

// POST /verify-complete — vouch for user via popup service
app.post('/verify-complete', async (req, res) => {
  try {
    const { invite_id, name } = req.body;
    const token = await getAccessToken();

    const verifyRes = await fetch(
      `${config.popupServiceUrl}/api/v1/namespaces/${config.namespace}/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pairingIdentifier: name,
          inviteId: invite_id,
        }),
      },
    );

    const body = await verifyRes.json();
    if (verifyRes.ok || verifyRes.status === 409) {
      // Redirect to QR code page
      res.redirect(body.redirectUrl);
    } else {
      res.status(verifyRes.status).json(body);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /demo — demo form
app.get('/demo', (_req, res) => {
  res.render('demo', { result: null });
});

// POST /demo/create-group — create group via popup service
app.post('/demo/create-group', async (req, res) => {
  try {
    const token = await getAccessToken();
    const { title, pairingIds } = req.body;
    const pairingIdentifiers = typeof pairingIds === 'string'
      ? pairingIds.split(',').map((s) => s.trim()).filter(Boolean)
      : req.body.pairingIdentifiers;

    const groupRes = await fetch(
      `${config.popupServiceUrl}/api/v1/namespaces/${config.namespace}/groups`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, pairingIdentifiers }),
      },
    );

    const body = await groupRes.json();
    if (groupRes.ok) {
      if (req.headers['content-type']?.includes('json')) {
        res.json(body);
      } else {
        res.render('demo', { result: body });
      }
    } else {
      res.status(groupRes.status).json(body);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(config.port, () => {
  console.log(`demo-popup-connector listening on port ${config.port}`);
  console.log(`Popup service URL: ${config.popupServiceUrl}`);
});

export { app, server };
