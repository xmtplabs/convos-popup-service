import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConvosPopupClient } from 'convos-popup-client';
import { loadConfig } from './lib/config.js';
import { createStore } from './lib/store.js';
import { createOAuth2TwitterClient } from './lib/twitter.js';
import { createTokenStore } from './lib/token-store.js';
import { createParser } from './lib/parser.js';
import { createBot } from './lib/bot.js';
import { transformV1Tweet } from './lib/webhook-transform.js';
import { createAccountActivityClient } from './lib/account-activity.js';
import * as oauth from './lib/oauth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const store = createStore();

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
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

// GET /verify/:invite_id — entry point (direct link or from popup service landing page)
app.get('/verify/:invite_id', (req, res) => {
  const { invite_id } = req.params;

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
    namespace: config.namespace,
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

    // Prevent the bot account from verifying — it would revoke bot tokens
    if (username.toLowerCase() === config.twitterBotUsername.toLowerCase()) {
      return res.render('x-error', { message: 'The bot account cannot be used for user verification.' });
    }

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

// --- Bot OAuth 2.0 authorization ---

let tokenStore = null;

// GET /bot-auth — start bot authorization flow
app.get('/bot-auth', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = oauth.generateCodeVerifier();
  const codeChallenge = oauth.generateCodeChallenge(codeVerifier);
  const redirectUri = `${config.baseUrl}/bot-auth/callback`;

  store.saveOAuthSession(state, {
    codeVerifier,
    purpose: 'bot-auth',
  });

  const authUrl = oauth.buildAuthorizationUrl({
    clientId: config.twitterOAuthClientId,
    redirectUri,
    state,
    codeChallenge,
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    oauthBaseUrl: config.twitterOAuthBaseUrl,
  });

  res.redirect(authUrl);
});

// GET /bot-auth/callback — exchange code for bot tokens
app.get('/bot-auth/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.render('x-error', { message: `Bot authorization denied: ${error}` });
  }

  if (!code || !state) {
    return res.render('x-error', { message: 'Missing authorization code or state.' });
  }

  const session = store.getOAuthSession(state);
  if (!session || session.purpose !== 'bot-auth') {
    return res.render('x-error', { message: 'Session expired or invalid. Visit /bot-auth to try again.' });
  }

  store.deleteOAuthSession(state);

  try {
    const tokenData = await oauth.exchangeCodeForToken({
      clientId: config.twitterOAuthClientId,
      clientSecret: config.twitterOAuthClientSecret || null,
      code,
      redirectUri: `${config.baseUrl}/bot-auth/callback`,
      codeVerifier: session.codeVerifier,
      apiBaseUrl: config.twitterApiBaseUrl,
    });

    const { username } = await oauth.getAuthenticatedUser(tokenData.access_token, {
      apiBaseUrl: config.twitterApiBaseUrl,
    });

    await tokenStore.save({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    });

    console.log(`Bot authorized as @${username}`);
    res.render('bot-auth-success', { username });
  } catch (err) {
    console.error('Bot auth callback error:', err.message);
    res.render('x-error', { message: 'Bot authorization failed. Visit /bot-auth to try again.' });
  }
});

// --- Webhook (push from tester / Account Activity API) ---

let bot = null;

function validateWebhookSignature(req) {
  const signature = req.headers['x-twitter-webhooks-signature'];
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', config.twitterApiSecret).update(req.rawBody).digest('base64');
  const expected = Buffer.from(`sha256=${hmac}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

app.post('/webhook/twitter', (req, res) => {
  if (!bot) {
    return res.status(400).json({ error: 'bot not ready' });
  }

  // v1.1 Account Activity API format
  if (req.body.tweet_create_events) {
    if (!validateWebhookSignature(req)) {
      return res.status(401).json({ error: 'invalid signature' });
    }

    const events = req.body.tweet_create_events;
    const botUser = config.twitterBotUsername.toLowerCase();

    for (const v1Event of events) {
      // Skip bot's own tweets
      if (v1Event.user?.screen_name?.toLowerCase() === botUser) continue;

      const { tweet, includes } = transformV1Tweet(v1Event);
      console.log(`[webhook] Received v1.1 tweet #${tweet.id}`);
      bot.processTweet(tweet, includes).catch((err) => {
        console.error(`[webhook] Error processing tweet #${tweet.id}:`, err.message);
      });
    }

    return res.json({ ok: true });
  }

  // v2 tester format (existing)
  const { tweet, includes } = req.body;
  if (!tweet) {
    return res.status(400).json({ error: 'missing tweet payload' });
  }
  console.log(`[webhook] Received tweet #${tweet.id}`);
  bot.processTweet(tweet, includes || { users: [] }).catch((err) => {
    console.error(`[webhook] Error processing tweet #${tweet.id}:`, err.message);
  });
  res.json({ ok: true });
});

// CRC challenge for Account Activity API
app.get('/webhook/twitter', (req, res) => {
  const crcToken = req.query.crc_token;
  if (!crcToken) return res.status(400).json({ error: 'missing crc_token' });
  const hmac = crypto.createHmac('sha256', config.twitterApiSecret).update(crcToken).digest('base64');
  res.json({ response_token: `sha256=${hmac}` });
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

  // Initialize token store and Twitter client (OAuth 2.0)
  tokenStore = await createTokenStore({ redisUrl: config.redisUrl });

  const refreshFn = (refreshToken) =>
    oauth.refreshAccessToken({
      clientId: config.twitterOAuthClientId,
      clientSecret: config.twitterOAuthClientSecret || null,
      refreshToken,
      apiBaseUrl: config.twitterApiBaseUrl,
    });

  const twitterClient = createOAuth2TwitterClient({
    tokenStore,
    config,
    refreshFn,
  });

  const storedToken = await tokenStore.load();
  if (!storedToken) {
    console.log(`*** Bot not yet authorized. Visit ${config.baseUrl}/bot-auth ***`);
  } else {
    console.log('Using stored OAuth 2.0 bot token.');
  }

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
  } else if (config.twitterWebhookEnv) {
    try {
      const aaa = createAccountActivityClient({ config });
      await aaa.setup();
      console.log(`Webhook mode (Account Activity API): polling disabled, receiving real-time events`);
    } catch (err) {
      console.error(`Account Activity API setup failed: ${err.message}`);
      console.log('Falling back to polling mode.');
      bot.start();
    }
  } else {
    bot.start();
  }

  return server;
}

const server = start();

export { app, server };
