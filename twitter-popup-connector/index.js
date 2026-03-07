import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConvosPopupClient } from 'convos-popup-client';
import { loadConfig } from './lib/config.js';
import { createStore } from './lib/store.js';
import { createTwitterClient } from './lib/twitter.js';
import { createParser } from './lib/parser.js';
import { createBot } from './lib/bot.js';
import * as oauth from './lib/oauth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const store = createStore();

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- Popup client ---

const popupClient = new ConvosPopupClient({
  baseUrl: config.popupServiceUrl,
  namespace: config.namespace,
  clientId: config.clientId,
  clientSecret: config.clientSecret,
});

// --- Routes ---

app.get('/app-icon.jpg', (_req, res) => {
  res.sendFile(path.join(__dirname, 'x-logo-black.jpg'));
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'x', registered: !!popupClient.clientId });
});

// GET /verify — entry point from popup service landing page
app.get('/verify', (req, res) => {
  const { invite_id, namespace } = req.query;

  if (!invite_id) {
    return res.render('x-error', { message: 'Missing invite ID.' });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = oauth.generateCodeVerifier();
  const codeChallenge = oauth.generateCodeChallenge(codeVerifier);
  const redirectUri = `${config.baseUrl}/callback`;

  store.saveOAuthSession(state, {
    codeVerifier,
    inviteId: invite_id,
    namespace: namespace || config.namespace,
  });

  const authUrl = oauth.buildAuthorizationUrl({
    clientId: config.twitterOAuthClientId,
    redirectUri,
    state,
    codeChallenge,
    scopes: ['tweet.read', 'users.read'],
    oauthBaseUrl: config.twitterOAuthBaseUrl,
  });

  res.render('x-verify', { authUrl });
});

// GET /callback — X OAuth callback
app.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.render('x-error', { message: `X authorization denied: ${error}` });
  }

  if (!code || !state) {
    return res.render('x-error', { message: 'Missing authorization code or state.' });
  }

  const session = store.getOAuthSession(state);
  if (!session) {
    return res.render('x-error', { message: 'Session expired or invalid. Try clicking the invite link again.' });
  }

  store.deleteOAuthSession(state);

  try {
    // Exchange code for token
    const tokenData = await oauth.exchangeCodeForToken({
      clientId: config.twitterOAuthClientId,
      clientSecret: config.twitterOAuthClientSecret || null,
      code,
      redirectUri: `${config.baseUrl}/callback`,
      codeVerifier: session.codeVerifier,
      apiBaseUrl: config.twitterApiBaseUrl,
    });

    // Get the user's X username
    const { username } = await oauth.getAuthenticatedUser(tokenData.access_token, {
      apiBaseUrl: config.twitterApiBaseUrl,
    });

    // Verify with popup service
    const result = await popupClient.verifyUser({
      pairingIdentifier: username,
      inviteId: session.inviteId,
    });

    res.redirect(result.redirectUrl);
  } catch (err) {
    console.error('OAuth callback error:', err.message);

    // Handle 409 (already verified) — still redirect
    if (err.status === 409 && err.redirectUrl) {
      return res.redirect(err.redirectUrl);
    }

    const message = err.status === 404
      ? 'Your X username was not found in this group invite.'
      : 'Verification failed. Try clicking the invite link again.';

    res.render('x-error', { message });
  }
});

// --- Webhook (push from tester / Account Activity API) ---

let bot = null;

app.post('/webhook/twitter', (req, res) => {
  const { tweet, includes } = req.body;
  if (!bot || !tweet) {
    return res.status(400).json({ error: 'missing tweet payload or bot not ready' });
  }
  console.log(`[webhook] Received tweet #${tweet.id}`);
  bot.processTweet(tweet, includes || { users: [] }).catch((err) => {
    console.error(`[webhook] Error processing tweet #${tweet.id}:`, err.message);
  });
  res.json({ ok: true });
});

// CRC challenge stub for future real Account Activity API use
app.get('/webhook/twitter', (req, res) => {
  const crcToken = req.query.crc_token;
  if (!crcToken) return res.status(400).json({ error: 'missing crc_token' });
  res.json({ response_token: `sha256=stub` });
});

// --- Startup ---

async function start() {
  // Start HTTP server first so endpoints (e.g. app-icon) are available
  // before registration, which may trigger the popup service to fetch the icon.
  const server = await new Promise((resolve) => {
    const s = app.listen(config.port, () => {
      console.log(`twitter-popup-connector listening on port ${config.port}`);
      console.log(`Popup service URL: ${config.popupServiceUrl}`);
      console.log(`Bot username: @${config.twitterBotUsername}`);
      resolve(s);
    });
  });

  // Register namespace if no pre-provisioned credentials
  if (!config.clientId || !config.clientSecret) {
    const params = {
      namespace: config.namespace,
      displayName: config.displayName,
      verificationEndpoint: `${config.baseUrl}/verify`,
      appIconUrl: config.appIconUrl,
      contactEmail: config.contactEmail,
    };
    try {
      const result = await popupClient.register(params);
      console.log(`Registered namespace: ${config.namespace}`);
      console.log(`TX_CLIENT_ID=${result.clientId}`);
      console.log(`TX_CLIENT_SECRET=${result.clientSecret}`);
      console.log('Save these as environment variables to skip registration on restart.');
    } catch (err) {
      if (err.status === 409) {
        console.log(`Namespace '${config.namespace}' already registered, continuing`);
      } else {
        console.error('Failed to register namespace:', err.message, err.details || '', params);
        process.exit(1);
      }
    }
  }

  // Initialize Twitter client and bot
  const twitterClient = createTwitterClient({
    apiKey: config.twitterApiKey,
    apiSecret: config.twitterApiSecret,
    accessToken: config.twitterAccessToken,
    accessSecret: config.twitterAccessSecret,
    apiBaseUrl: config.twitterApiBaseUrl,
  });

  const parser = createParser({ apiKey: config.openaiApiKey });

  bot = createBot({
    twitterClient,
    parser,
    popupClient,
    store,
    config,
  });

  if (config.twitterApiBaseUrl) {
    console.log(`Webhook mode (tester): polling disabled, waiting for POST /webhook/twitter`);
  } else {
    bot.start();
  }

  return server;
}

const server = start();

export { app, server };
