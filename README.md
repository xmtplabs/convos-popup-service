# convos-popup-service

Convos popup service — namespace registration with approval, OAuth 2.0 client credentials, group creation, invite/QR pages. Includes a test connect client (`demo-popup-connector`) for local development.

## First Run

### Prerequisites

- Node.js 22+
- npm

Install dependencies:

```
npm install
```

---

### Option A: Standalone (popup-service only)

This runs just the popup service on port 3000 with in-memory storage and a real XMTP agent (ephemeral key). No Redis, no Docker, no second service. Good for exploring the API directly with curl.

#### 1. Start the service

```
npm start
```

You should see pino log output including:

```
Using MemoryStorage (no REDIS_URL set)
No XMTP_AGENT_KEY set — agent will generate an ephemeral key
Popup service started  {"port":3000,"env":"development"}
```

#### 2. Verify it's running

Open **http://localhost:3000/health** in your browser.

You should see:

```json
{"status":"ok"}
```

#### 3. Register a namespace

```
curl -s -X POST http://localhost:3000/connect/register \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": "test-x",
    "displayName": "Test X Service",
    "verificationEndpoint": "https://example.com/verify",
    "appIconUrl": "https://placehold.co/400.png",
    "contactEmail": "test@example.com"
  }'
```

You should see a `202` response with `clientId`, `clientSecret`, `status: "pending_approval"`. Save the `clientId` and `clientSecret` values — the secret is only shown once.

Back in the terminal running the service, you'll see a log line containing an approval URL:

```
New namespace registration: "test-x". Approve: http://localhost:3000/connect/approve/eyJ...
```

#### 4. Approve the namespace

Copy the full approval URL from the log output and open it in your browser (or curl it):

```
curl -s http://localhost:3000/connect/approve/eyJ...FULL_TOKEN_HERE
```

You should see an HTML page saying **"Namespace Approved"** — the namespace `test-x` is now active.

#### 5. Exchange credentials for an access token

Using the `clientId` and `clientSecret` from step 3:

```
curl -s -X POST http://localhost:3000/auth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET'
```

You should see a `200` response:

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "groups:write pairing:write verify:write"
}
```

Save the `access_token` value.

#### 6. Create a group

```
curl -s -X POST http://localhost:3000/api/v1/namespaces/test-x/groups \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -d '{
    "title": "Chat between @alice and @bob",
    "pairingIdentifiers": ["@alice", "@bob"]
  }'
```

You should see a `201` response with a `groupId` and an `invites` array — one invite per pairing identifier, each with an `inviteUrl`.

#### 7. Visit an invite page

Copy one of the `inviteUrl` values (e.g. `http://localhost:3000/invite/inv_...`) and open it in your browser.

You should see the **landing page**: a card showing the pairing ID, the display name "Test X Service", and a "Verify your identity" button. (The button links to the verification endpoint you registered — in this case `https://example.com/verify` — which won't resolve locally. In the Docker setup below, the demo-popup-connector handles this.)

#### 8. Stop

Press `Ctrl+C` in the terminal.

---

### Option B: Docker Compose (full two-service setup)

This runs all three containers — Redis, popup-service (port 3000), and demo-popup-connector (port 4000). The demo-popup-connector is a test connect client that lets you type any name as "verification" — no real OAuth. This is the full end-to-end flow with a real XMTP agent.

#### Prerequisites

- Docker and Docker Compose

#### 1. Start everything

```
./scripts/test-up.sh
```

You should see it build both images, then wait for health checks. When ready:

```
All services are up!
  Popup service:   http://localhost:3000
  demo-popup-connector: http://localhost:4000
```

#### 2. Verify both services are running

Open **http://localhost:3000/health** — you should see `{"status":"ok"}`.

Open **http://localhost:4000/health** — you should see `{"status":"ok","registered":false}`.

#### 3. Register the test namespace

```
curl -s -X POST http://localhost:4000/register
```

> **Note:** If registration fails with a validation error for `appIconUrl`, ensure the demo-popup-connector image is rebuilt (`docker compose build`).

You should see an HTML page showing the namespace `test-x`, a `clientId`, a `clientSecret`, and status `pending_approval`. The demo-popup-connector stores these credentials automatically.

#### 4. Approve the namespace

View the popup-service logs to find the approval URL:

```
docker compose logs popup-service | grep "Approve:"
```

You'll see a line like:

```
New namespace registration: "test-x". Approve: http://localhost:3000/connect/approve/eyJ...
```

Open that full URL in your browser. You should see **"Namespace Approved"**.

#### 5. Create a group

Open **http://localhost:4000/demo** in your browser.

You should see a form with two fields: "Group Title" and "Pairing Identifiers (comma-separated)".

Fill in:
- **Title:** `Chat between @alice and @bob`
- **Pairing Identifiers:** `@alice, @bob`

Click **Create Group**.

You should see a result section below the form showing the `groupId` and one invite URL per pairing identifier. Each URL looks like `http://localhost:3000/invite/inv_...`.

#### 6. Open an invite link

Click one of the invite URLs (e.g. the one for `@alice`).

You should see the **landing page** served by the popup service: a card showing the pairing ID `@alice`, verified by "Test X Service", verification domain `localhost`, and a blue "Verify your identity" button.

#### 7. Verify your identity

Click the **"Verify your identity"** button.

You are redirected to the demo-popup-connector's verification form at `http://localhost:4000/verify?invite_id=inv_...&callback=...&namespace=test-x`.

You should see a form titled **"Verify Your Identity"** with a text input asking for your name/handle. Type `@alice` (matching the pairing identifier from the invite) and click **Verify**.

#### 8. See the QR code

After submitting, the demo-popup-connector vouches for you with the popup service, gets back a one-time redirect URL, and sends your browser there.

You should see the **QR code page** served by the popup service: a card titled "Scan to join group" with a QR code SVG. Scanning this with the Convos app will add you to the XMTP group.

If you go back and try the same link again, you'll see **"Link Already Used"** — each verification link is single-use.

#### 9. Stop

```
./scripts/test-down.sh
```

This stops all containers and removes volumes.

---

## Running Tests

```
npm test
```

Runs all 89 tests across 15 test files (unit + integration). No Docker or Redis required — tests use in-memory storage.
