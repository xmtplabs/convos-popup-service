# Twitter Popup Connector

Connects a Twitter bot account to the Convos popup service. Monitors mentions, parses intent via OpenAI, creates group chats, and verifies users through OAuth.

## Prerequisites

- Node 22+
- A running popup service instance
- A [Twitter app](https://developer.x.com/en/portal/dashboard) with OAuth 2.0 enabled
- An OpenAI API key

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `TWITTER_OAUTH_CLIENT_ID` | yes | Twitter app OAuth 2.0 client ID |
| `TWITTER_OAUTH_CLIENT_SECRET` | yes | Twitter app OAuth 2.0 client secret |
| `TWITTER_API_SECRET` | yes | Twitter app consumer secret (for CRC webhook validation) |
| `TWITTER_BOT_USERNAME` | no | Bot's Twitter handle (default: `ConvosConnect`) |
| `OPENAI_API_KEY` | yes | OpenAI API key for tweet parsing |
| `POPUP_SERVICE_URL` | no | Popup service URL (default: `http://localhost:3000`) |
| `TX_BASE_URL` | no | Public URL of this service (default: `http://localhost:4100`) |
| `TX_PORT` | no | Listen port (default: `4100`) |
| `REDIS_URL` | no | Redis URL for token storage (falls back to file if unset) |
| `TX_CLIENT_ID` | no | Pre-provisioned popup service client ID (skips registration) |
| `TX_CLIENT_SECRET` | no | Pre-provisioned popup service client secret |

## Setup

### Local development (with tester)

```
docker compose up -d --build
```

This starts Redis, the popup service, a fake Twitter API server, and the connector. No real Twitter credentials needed.

### Production

1. Set the environment variables above.
2. Start the service:
   ```
   node --env-file=../.env index.js
   ```
3. On first start, logs will print:
   ```
   *** Bot not yet authorized. Visit http://localhost:4100/bot-auth ***
   ```
4. Open `/bot-auth` in a browser, sign in as the bot's Twitter account, and authorize.
5. Tokens are persisted to Redis (or `data/bot-token.json` if no Redis). Restart does not require re-auth.

## How it works

1. **Bot auth** (`/bot-auth`) -- One-time OAuth 2.0 flow to authorize the bot account with `tweet.read`, `tweet.write`, `users.read`, and `offline.access` scopes. Tokens auto-refresh.
2. **Mention processing** -- Polls Twitter (or receives webhooks) for @mentions. Parses intent with OpenAI. Creates a group via the popup service and replies with an invite link.
3. **User verification** (`/verify/:invite_id`) -- Each invited user clicks the link, authenticates via Twitter OAuth, and gets verified against the popup service.
