# Convos Popup Service — Flow Documentation

This document describes every flow in the **convos-popup-service** system: a reusable JavaScript library/framework built on Express, Redis, and Prometheus that consumers extend by implementing a "connector" component. The reference consumer is **popup-x-service**, which implements a connector for X/Twitter.

---

## Table of Contents

1. [Service Setup / Bootstrap Flow](#1-service-setup--bootstrap-flow)
2. [Group Creation Flow](#2-group-creation-flow)
3. [Authorization / Join Flow](#3-authorization--join-flow)
4. [XMTP Agent Lifecycle Flow](#4-xmtp-agent-lifecycle-flow)
5. [Health & Readiness Flow](#5-health--readiness-flow)
6. [Metrics Flow](#6-metrics-flow)
7. [Error / Edge Case Flows](#7-error--edge-case-flows)
8. [Appendix: Open Questions & Ambiguities](#appendix-open-questions--ambiguities)

---

## 1. Service Setup / Bootstrap Flow

### Description

The bootstrap flow covers everything that happens from process start to a fully operational service. A consumer package (e.g., popup-x-service) imports the root library, supplies configuration and a connector implementation, and receives a running Express server with an active XMTP agent.

### Actors

| Actor | Role |
|---|---|
| **Consumer package** | Imports the root library, provides connector implementation and configuration |
| **Root library (convos-popup-service)** | Wires up Express, storage, XMTP agent, and Prometheus metrics |
| **Storage backend** | Either in-memory Map or Redis instance |
| **XMTP network** | Decentralized messaging network the agent connects to |
| **Prometheus** | Metrics registry initialized at boot |

### Step-by-Step Sequence

1. The consumer package (e.g., popup-x-service) imports `createApp` (or equivalent factory) from the root library.
2. The consumer instantiates a storage implementation:
   - **In-memory**: A simple Map-based store; suitable for development or single-instance deployments.
   - **Redis**: Connects to a Redis instance at a configurable URL; suitable for production and multi-instance deployments.
3. The consumer creates a connector implementation. The connector must satisfy a contract that includes:
   - A method to initiate authorization (e.g., build an OAuth redirect URL).
   - A callback handler that extracts and verifies a pairing identifier from the authorization response.
   - Any connector-specific configuration (API keys, OAuth secrets, etc.).
4. The consumer calls `createApp({ storage, connector, ...config })`, which:
   a. Creates an Express application instance.
   b. Registers middleware: body parsing, request logging, Prometheus HTTP metrics instrumentation.
   c. Mounts route handlers:
      - `GET /health` — liveness probe
      - `GET /ready` — readiness probe (checks storage and agent connectivity)
      - `GET /metrics` — Prometheus metrics endpoint
      - `POST /api/groups` — group creation
      - `GET /invite/:inviteId` — landing page
      - `GET /auth/callback` — OAuth callback (delegated to connector)
   d. Initializes the Prometheus `prom-client` default metrics and any custom counters/histograms.
   e. Initializes the XMTP agent via `@xmtp/agent-sdk` with the `convos-node-sdk` middleware.
   f. The XMTP agent connects to the network and begins listening for group membership events.
5. The consumer calls `app.listen(port)` or the factory starts listening automatically.
6. The service is now ready to accept requests.

### Sequence Diagram

```
Consumer              Root Library             Storage           XMTP Network
   |                      |                      |                    |
   |-- import createApp ->|                      |                    |
   |                      |                      |                    |
   |-- instantiate ------>|                      |                    |
   |   storage            |                      |                    |
   |                      |                      |                    |
   |-- create connector ->|                      |                    |
   |                      |                      |                    |
   |-- createApp(cfg) --->|                      |                    |
   |                      |-- create Express --->|                    |
   |                      |   app instance       |                    |
   |                      |                      |                    |
   |                      |-- register routes -->|                    |
   |                      |                      |                    |
   |                      |-- init Prometheus -->|                    |
   |                      |                      |                    |
   |                      |-- connect storage ---|-->  ping/connect   |
   |                      |                      |<-- OK              |
   |                      |                      |                    |
   |                      |-- init XMTP agent ---|----connect-------->|
   |                      |                      |                    |
   |                      |                      |    <-- connected --|
   |                      |                      |                    |
   |<-- app instance -----|                      |                    |
   |                      |                      |                    |
   |-- app.listen(port) ->|                      |                    |
   |                      |                      |                    |
   |<-- listening on port-|                      |                    |
```

### Data Transformations

| Step | Data Created / Stored |
|---|---|
| Storage instantiation | Connection pool or in-memory Map initialized (empty) |
| Connector creation | OAuth credentials and connector config held in memory |
| XMTP agent init | Agent keypair loaded or generated; agent identity registered on the XMTP network |
| Prometheus init | Default metrics (process CPU, memory, event loop lag) and custom metrics registered |

### Error Conditions

| Condition | Handling |
|---|---|
| Redis unreachable at startup | The service should fail fast with a clear error message. If using in-memory storage, this is not applicable. |
| XMTP agent fails to connect | The service should start but report not-ready on `GET /ready`. Retry logic should be built into the agent SDK. |
| Invalid connector configuration | The factory should throw synchronously so the consumer gets an immediate error. |
| Port already in use | Node's standard `EADDRINUSE` error propagates to the consumer. |

### Security Considerations

- 🔒 **XMTP agent private key management**: The agent's private key must be stored securely (environment variable, secrets manager) and never logged or exposed via endpoints.
- 🔒 **Connector secrets (OAuth client secrets)**: Must be provided via environment variables, not hardcoded. Should never appear in logs or error responses.
- 🔒 **Redis authentication**: If Redis is used in production, it should require authentication (`redis://user:password@host:port`) and ideally use TLS (`rediss://`).

---

## 2. Group Creation Flow

### Description

An external caller creates a new Convos group by posting an array of pairing identifiers and a group description. The service creates the group on the XMTP network, stores the association between pairing identifiers and the group, generates invite URLs, and returns them.

### Actors

| Actor | Role |
|---|---|
| **External caller** | The entity that initiates group creation (could be the connector, an admin, or another service) |
| **Root library / Express server** | Receives the request, orchestrates group creation |
| **XMTP agent** | Creates the group on the XMTP network |
| **Storage backend** | Persists group-to-pairing-identifier mappings and invite data |
| **Convos SDK** | Generates invite URLs / QR code data |

### Step-by-Step Sequence

1. The external caller sends `POST /api/groups` with a JSON body:
   ```json
   {
     "pairingIdentifiers": ["@user1", "@user2"],
     "group": {
       "title": "Discussion between @user1 and @user2",
       "description": "Optional longer description"
     }
   }
   ```
2. The Express route handler validates the request body:
   - `pairingIdentifiers` must be a non-empty array of strings.
   - `group.title` must be a non-empty string.
3. The handler calls the XMTP agent SDK to create a new group with the provided title/description.
   - The agent is automatically a member (and initially the only member / admin) of the new group.
4. The XMTP network returns a group ID.
5. For **each** pairing identifier, the service:
   a. Generates a unique invite ID (e.g., a UUID or random token).
   b. Stores the mapping: `inviteId -> { groupId, pairingIdentifier, status: "pending" }`.
   c. Stores the reverse mapping: `pairingIdentifier -> groupId` (for lookup during auth callback).
   d. Constructs an invite URL: `https://<service-host>/invite/<inviteId>`.
6. The service stores group-level metadata: `groupId -> { title, description, pairingIdentifiers, createdAt }`.
7. The service increments the Prometheus counter for group creations.
8. The service responds with `201 Created`:
   ```json
   {
     "groupId": "0xabc123...",
     "invites": [
       { "pairingIdentifier": "@user1", "inviteUrl": "https://host/invite/uuid-1" },
       { "pairingIdentifier": "@user2", "inviteUrl": "https://host/invite/uuid-2" }
     ]
   }
   ```

> **WARNING — Ambiguity**: Is there one invite URL per pairing identifier, or one invite URL per group? The description mentions "an invite URL is generated for each pairing identifier (or one per group)." This document assumes **one per pairing identifier** because each user needs to independently authorize and prove their identity. If it is one per group, the authorization flow would need a different mechanism to determine which pairing identifier the authorizing user claims to own.

### Sequence Diagram

```
External Caller       Express Server         XMTP Agent        Storage        XMTP Network
      |                     |                     |                |                |
      |-- POST /api/groups->|                     |                |                |
      |   {pairingIds,      |                     |                |                |
      |    group}            |                     |                |                |
      |                     |                     |                |                |
      |                     |-- validate body --  |                |                |
      |                     |                     |                |                |
      |                     |-- createGroup() --->|                |                |
      |                     |                     |-- create ----->|                |
      |                     |                     |   group        |                |
      |                     |                     |                |                |
      |                     |                     |<-- groupId ----|                |
      |                     |<-- groupId ---------|                |                |
      |                     |                     |                |                |
      |                     |  for each pairingId:|                |                |
      |                     |-- generate inviteId |                |                |
      |                     |-- store mapping ----|--------------->|                |
      |                     |   inviteId -> {     |                |                |
      |                     |     groupId,        |                |                |
      |                     |     pairingId,      |                |                |
      |                     |     status}         |                |                |
      |                     |                     |                |                |
      |                     |-- store group meta -|--------------->|                |
      |                     |                     |                |                |
      |                     |-- increment metric  |                |                |
      |                     |                     |                |                |
      |<-- 201 {groupId, --|                     |                |                |
      |    invites[]}       |                     |                |                |
```

### Data Transformations

| Step | Data Created / Stored |
|---|---|
| Request validation | None (validation only) |
| XMTP group creation | New group on the XMTP network; group ID returned |
| Invite ID generation | UUID or cryptographic random token per pairing identifier |
| Storage writes | `invite:<inviteId>` -> `{ groupId, pairingIdentifier, status: "pending", createdAt }` |
| | `pairing:<pairingIdentifier>` -> `{ groupId, inviteId }` |
| | `group:<groupId>` -> `{ title, description, pairingIdentifiers: [...], allJoined: false, createdAt }` |
| Response construction | Invite URLs assembled from service host + invite IDs |

### Error Conditions

| Condition | HTTP Status | Handling |
|---|---|---|
| Missing or invalid request body | 400 | Return validation error details |
| XMTP agent not connected | 503 | Return "Service Unavailable" — agent is not ready |
| XMTP group creation fails | 502 | Return "Bad Gateway" — upstream XMTP error |
| Storage write fails | 500 | Return "Internal Server Error"; consider rolling back the XMTP group (if possible) |
| Duplicate pairing identifier in array | 400 | Reject the request — each identifier should be unique within the group |

### Security Considerations

- 🔒 **Authorization on group creation**: Who is authorized to call `POST /api/groups`? This endpoint creates resources and triggers invite generation. It should be protected by an API key, JWT, or similar mechanism. Without authentication, anyone can create groups and generate invite URLs.

> **WARNING — Ambiguity**: The system description does not specify how `POST /api/groups` is authenticated or authorized. This is a significant gap. Possible approaches: API key in a header, JWT bearer token, IP allowlisting, or mutual TLS.

- 🔒 **Invite URL entropy**: Invite IDs must be generated with sufficient entropy (at least 128 bits / UUID v4) to prevent guessing or brute-forcing. Sequential IDs or short tokens would be a serious vulnerability.
- 🔒 **Rate limiting**: The group creation endpoint should be rate-limited to prevent abuse (mass group creation, storage exhaustion).

---

## 3. Authorization / Join Flow

### Description

This is the most complex flow in the system. A user receives an invite URL, visits a landing page, authorizes via an external OAuth provider (e.g., X/Twitter), and upon successful verification of their identity, is shown a QR code to join the Convos group. This flow bridges Web2 identity (Twitter handle) with Web3 group membership (XMTP/Convos).

### Actors

| Actor | Role |
|---|---|
| **End user (browser)** | The person who received the invite URL and wants to join the group |
| **Express server** | Serves the landing page, handles the OAuth callback |
| **Connector (e.g., X/Twitter connector)** | Builds the OAuth redirect, extracts identity from callback |
| **External OAuth provider (e.g., X/Twitter)** | Authenticates the user and redirects back with proof of identity |
| **Storage backend** | Looks up invite data, stores authorization status |
| **Convos SDK** | Generates the QR code for group joining |

### Step-by-Step Sequence

#### Phase 1: Landing Page

1. The user clicks or navigates to the invite URL: `GET /invite/:inviteId`.
2. The Express server looks up `invite:<inviteId>` in storage.
3. If the invite ID is not found, the server returns `404 Not Found` with a user-friendly error page.
4. If found, the server retrieves group metadata using the stored `groupId`.
5. The server renders an HTML landing page showing:
   - The group title and description.
   - The pairing identifier this invite is for (e.g., "This invite is for @user1").
   - An "Authorize" button.
6. The "Authorize" button links to a URL that initiates the connector's authorization flow.

> **WARNING — Ambiguity**: How does the landing page know what to display? It likely pulls group metadata from storage using the `groupId` associated with the invite. The exact fields available (title, description, member count, etc.) depend on what was stored during group creation.

#### Phase 2: OAuth Authorization

7. The user clicks "Authorize", which triggers `GET /auth/authorize?inviteId=<inviteId>` (or a similar route).
8. The Express server delegates to the connector's authorization initiation method.
9. The connector:
   a. Generates an OAuth state parameter that encodes the `inviteId` (or stores the mapping in a session/storage).
   b. Builds the OAuth authorization URL for the external provider (e.g., `https://api.twitter.com/2/oauth2/authorize?...`).
10. The server responds with a `302 Redirect` to the external OAuth provider's authorization URL.
11. The user's browser follows the redirect to the OAuth provider.
12. The user authenticates with the OAuth provider (e.g., logs in to Twitter, grants permission).
13. The OAuth provider redirects the user's browser back to: `GET /auth/callback?code=<authCode>&state=<state>`.

#### Phase 3: Callback and Verification

14. The Express server receives the callback and delegates to the connector's callback handler.
15. The connector:
    a. Validates the `state` parameter to prevent CSRF attacks.
    b. Exchanges the authorization `code` for an access token with the OAuth provider.
    c. Uses the access token to fetch the user's profile from the OAuth provider.
    d. Extracts the pairing identifier from the profile (e.g., the Twitter handle `@user1`).
16. The Express server receives the extracted pairing identifier from the connector.
17. The server looks up the pairing identifier in storage to find the associated `groupId` and `inviteId`.
18. The server verifies that the extracted pairing identifier **matches** the one associated with the invite.
19. If verification succeeds, the server produces a **signed pairing identifier** — a cryptographically signed token that proves this user owns this pairing ID.
20. The server updates the invite status in storage: `status: "pending"` -> `status: "authorized"`.
21. The server increments the Prometheus counter for successful authorizations.

> **WARNING — Ambiguity**: How does the "signed pairing identifier" work? What signs it? Possibilities include:
> - An HMAC using a server-side secret key.
> - A JWT signed with the server's private key.
> - A signature from the XMTP agent's keypair.
>
> How is it verified later? Is it passed to the Convos app when scanning the QR code? Is it embedded in the group join URL? This mechanism is critical to the security model and needs clarification.

#### Phase 4: QR Code Display

22. The server redirects the user to a results page (e.g., `GET /invite/:inviteId/join?token=<signedToken>`).
23. The server uses the Convos SDK to generate a QR code that encodes the group join URL.
24. The server renders an HTML page displaying:
    - A success message ("You've been verified as @user1").
    - The QR code.
    - Instructions to scan with the Convos app.
    - Optionally, a deep link for mobile users already on a phone.
25. The user scans the QR code with their Convos app.
26. The Convos app initiates the XMTP group join process (this happens outside the web service).

### Sequence Diagram

```
User Browser       Express Server      Connector        OAuth Provider       Storage        Convos SDK
     |                   |                 |                  |                  |               |
     |-- GET /invite/    |                 |                  |                  |               |
     |   :inviteId ----->|                 |                  |                  |               |
     |                   |-- lookup -------|------------------|----------------->|               |
     |                   |   invite        |                  |                  |               |
     |                   |<-- invite data -|------------------|------------------|               |
     |                   |                 |                  |                  |               |
     |                   |-- lookup -------|------------------|----------------->|               |
     |                   |   group meta    |                  |                  |               |
     |                   |<-- group data --|------------------|------------------|               |
     |                   |                 |                  |                  |               |
     |<-- HTML landing   |                 |                  |                  |               |
     |   page with       |                 |                  |                  |               |
     |   "Authorize" btn |                 |                  |                  |               |
     |                   |                 |                  |                  |               |
     |== User clicks "Authorize" =========|==================|==================|===============|
     |                   |                 |                  |                  |               |
     |-- GET /auth/      |                 |                  |                  |               |
     |   authorize ----->|                 |                  |                  |               |
     |                   |-- buildAuthURL->|                  |                  |               |
     |                   |   (inviteId)    |                  |                  |               |
     |                   |                 |-- generate state |                  |               |
     |                   |                 |   store state--->|----------------->|               |
     |                   |<-- authURL -----|                  |                  |               |
     |                   |                 |                  |                  |               |
     |<-- 302 Redirect   |                 |                  |                  |               |
     |   to OAuth URL    |                 |                  |                  |               |
     |                   |                 |                  |                  |               |
     |-- GET oauth ------>---------------->|----------------->|                  |               |
     |   authorize URL   |                 |                  |                  |               |
     |                   |                 |                  |                  |               |
     |<-- login/consent  |                 |   <-- form ------|                  |               |
     |   page            |                 |                  |                  |               |
     |                   |                 |                  |                  |               |
     |-- user grants --->|---------------->|----------------->|                  |               |
     |   permission      |                 |                  |                  |               |
     |                   |                 |                  |                  |               |
     |<-- 302 Redirect   |                 |  <-- redirect ---|                  |               |
     |   to callback     |                 |   ?code=X        |                  |               |
     |                   |                 |   &state=Y       |                  |               |
     |                   |                 |                  |                  |               |
     |-- GET /auth/      |                 |                  |                  |               |
     |   callback ------>|                 |                  |                  |               |
     |   ?code=X         |                 |                  |                  |               |
     |   &state=Y        |                 |                  |                  |               |
     |                   |-- handleCB()--->|                  |                  |               |
     |                   |   (code, state) |                  |                  |               |
     |                   |                 |-- validate state |                  |               |
     |                   |                 |-- exchange code->|                  |               |
     |                   |                 |   for token      |                  |               |
     |                   |                 |<-- access token--|                  |               |
     |                   |                 |-- fetch profile->|                  |               |
     |                   |                 |<-- profile ------|                  |               |
     |                   |                 |   (@user1)       |                  |               |
     |                   |<-- pairingId ---|                  |                  |               |
     |                   |   ("@user1")    |                  |                  |               |
     |                   |                 |                  |                  |               |
     |                   |-- lookup pairing|------------------|----------------->|               |
     |                   |   identifier    |                  |                  |               |
     |                   |<-- {groupId, ---|------------------|------------------|               |
     |                   |    inviteId}    |                  |                  |               |
     |                   |                 |                  |                  |               |
     |                   |-- verify match  |                  |                  |               |
     |                   |   (pairingId == |                  |                  |               |
     |                   |    invite's ID) |                  |                  |               |
     |                   |                 |                  |                  |               |
     |                   |-- sign pairing  |                  |                  |               |
     |                   |   identifier    |                  |                  |               |
     |                   |                 |                  |                  |               |
     |                   |-- update invite |------------------|----------------->|               |
     |                   |   status =      |                  |                  |               |
     |                   |   "authorized"  |                  |                  |               |
     |                   |                 |                  |                  |               |
     |<-- 302 Redirect   |                 |                  |                  |               |
     |   /invite/:id/join|                 |                  |                  |               |
     |   ?token=signed   |                 |                  |                  |               |
     |                   |                 |                  |                  |               |
     |-- GET /invite/    |                 |                  |                  |               |
     |   :id/join ------>|                 |                  |                  |               |
     |                   |-- generate QR ->|------------------|------------------|-------------->|
     |                   |   code          |                  |                  |               |
     |                   |<-- QR code -----|------------------|------------------|---------------|
     |                   |                 |                  |                  |               |
     |<-- HTML page with |                 |                  |                  |               |
     |   QR code         |                 |                  |                  |               |
     |                   |                 |                  |                  |               |
     |== User scans QR ==|=================|==================|==================|===============|
     |   with Convos app |                 |                  |                  |               |
```

### Data Transformations

| Step | Data Created / Looked Up / Transformed |
|---|---|
| `GET /invite/:inviteId` | **Lookup**: `invite:<inviteId>` -> `{ groupId, pairingIdentifier, status }` |
| | **Lookup**: `group:<groupId>` -> `{ title, description }` |
| Authorize initiation | **Created**: OAuth state parameter (random token encoding `inviteId`) |
| | **Stored**: `oauth-state:<state>` -> `{ inviteId, createdAt }` (for CSRF validation) |
| OAuth callback | **Looked up**: `oauth-state:<state>` -> `{ inviteId }` (and then deleted to prevent replay) |
| | **Received**: Authorization code from OAuth provider |
| | **Exchanged**: Auth code -> access token (with OAuth provider) |
| | **Fetched**: User profile from OAuth provider -> pairing identifier extracted |
| Verification | **Looked up**: `pairing:<pairingIdentifier>` -> `{ groupId, inviteId }` |
| | **Verified**: extracted pairingIdentifier matches invite's pairingIdentifier |
| Signed token | **Created**: Signed pairing identifier token (HMAC, JWT, or agent signature) |
| Status update | **Updated**: `invite:<inviteId>.status` = `"authorized"` |
| QR code | **Generated**: QR code image encoding the Convos group join URL |

### Error Conditions

| Condition | HTTP Status | Handling |
|---|---|---|
| Invite ID not found | 404 | Render a user-friendly "Invite not found" page |
| Invite already authorized | 403 or redirect | Either block re-authorization or allow it idempotently (see Edge Cases) |
| OAuth state mismatch / missing | 403 | Render "Authorization failed — possible CSRF attack" page |
| OAuth code exchange fails | 502 | Render "Authorization failed — could not verify your identity" page |
| Extracted pairing ID does not match invite | 403 | Render "Identity mismatch — you authorized as @X but this invite is for @Y" |
| Storage lookup fails | 500 | Render a generic error page |
| QR code generation fails | 500 | Render error page; log the failure |

### Security Considerations

- 🔒 **OAuth state parameter (CSRF protection)**: The `state` parameter sent to the OAuth provider MUST be a cryptographically random value bound to the user's session or invite ID. On callback, it MUST be validated. Without this, an attacker could initiate an OAuth flow and redirect a victim's browser to the callback with the attacker's authorization code.
- 🔒 **OAuth state must be single-use**: After validation, delete the state from storage to prevent replay attacks.
- 🔒 **Invite URL guessability**: If invite IDs are predictable, an attacker could visit other users' invite pages. Use UUID v4 (122 bits of entropy) or a `crypto.randomBytes(32)` hex string.
- 🔒 **Signed pairing identifier exposure**: The signed token appears in the redirect URL (query parameter). This means it may be logged in server access logs, browser history, and any intermediary proxies. Consider:
  - Short-lived tokens (expire after minutes).
  - Single-use tokens (invalidate after QR code page is loaded).
  - Using HTTP-only cookies instead of query parameters.
- 🔒 **Rate limiting on `/auth/callback`**: An attacker could attempt to brute-force the OAuth callback. Rate limit by IP.
- 🔒 **QR code exposure**: The QR code encodes a URL that allows joining the group. If someone screenshots or photographs the QR code, they could join without being authorized. Consider:
  - Making the QR code single-use or time-limited.
  - Requiring additional verification in the Convos app.
- 🔒 **Token in URL risks**: Signed tokens in query strings can leak via `Referer` headers if the page loads external resources. Ensure the QR code page does not load third-party scripts or resources, or use `Referrer-Policy: no-referrer`.

---

## 4. XMTP Agent Lifecycle Flow

### Description

The XMTP agent is a bot that is a member of every created group. It monitors group membership changes and, once all expected users have joined, promotes every user to super admin and then removes itself from the group. This flow runs continuously in the background.

### Actors

| Actor | Role |
|---|---|
| **XMTP agent** | Bot running within the service, member of all created groups |
| **XMTP network** | Delivers group membership events to the agent |
| **Storage backend** | Tracks which pairing identifiers have been fulfilled |
| **End users (via Convos app)** | Join groups by scanning QR codes |

### Step-by-Step Sequence

#### Phase 1: Group Monitoring (Continuous)

1. The XMTP agent, initialized at service startup, listens for membership change events across all groups it belongs to.
2. When a new member joins a group, the XMTP network delivers a membership event to the agent.
3. The agent receives the event containing:
   - The group ID.
   - The new member's XMTP identity (address/installation ID).

#### Phase 2: Join Tracking

4. The agent looks up the group metadata in storage: `group:<groupId>`.
5. The agent needs to determine which pairing identifier this new XMTP user corresponds to.

> **WARNING — Ambiguity**: How does the XMTP agent correlate a joining XMTP user (identified by their XMTP address) with a pairing identifier (e.g., a Twitter handle)? Possible mechanisms:
> - The signed pairing identifier token is submitted to the group as a message upon joining, and the agent reads it.
> - The Convos app includes the signed token in the join request metadata.
> - The service stores a mapping of `signed-token -> XMTP address` when the QR code is scanned (but this requires the scan to hit the service first).
> - The agent simply counts members and does not track which specific pairing ID each member fulfills.
>
> The simplest approach (and likely the one used) may be that the agent just counts: if the group was created for N pairing identifiers, the agent waits until N non-agent members are present, regardless of which specific pairing ID each one fulfills.

6. The agent updates its tracking state:
   - Increments the "joined members" count for this group.
   - Optionally marks a specific pairing identifier as "fulfilled."
7. The agent stores the updated state in storage.
8. The agent increments the Prometheus counter for user joins.

#### Phase 3: Completion (All Users Joined)

9. After each join event, the agent checks: have **all** expected users joined?
   - Expected count = number of pairing identifiers for this group.
   - Current count = number of non-agent members in the group.
10. If not all users have joined, the agent continues monitoring (back to step 1).
11. If all users have joined:
    a. The agent promotes **every non-agent member** to **super admin**.
    b. The agent sends a farewell message to the group (optional, depends on implementation).
    c. The agent **leaves the group**.
    d. The agent updates group metadata in storage: `allJoined: true`, `completedAt: <timestamp>`.
    e. The agent increments the Prometheus counter for completed groups.

### Sequence Diagram

```
Convos App          XMTP Network          XMTP Agent            Storage
(User)                  |                      |                    |
   |                    |                      |                    |
   |-- join group ----->|                      |                    |
   |   (scan QR)        |                      |                    |
   |                    |-- membership event -->|                    |
   |                    |   {groupId,           |                    |
   |                    |    newMember}          |                    |
   |                    |                      |                    |
   |                    |                      |-- lookup group --->|
   |                    |                      |   metadata         |
   |                    |                      |<-- {pairingIds,    |
   |                    |                      |    joinedCount}    |
   |                    |                      |                    |
   |                    |                      |-- update join ---->|
   |                    |                      |   count            |
   |                    |                      |                    |
   |                    |                      |-- check: all       |
   |                    |                      |   joined?          |
   |                    |                      |                    |
   |                    |                      |   [NOT ALL JOINED] |
   |                    |                      |-- continue         |
   |                    |                      |   monitoring       |
   |                    |                      |                    |
   |                    |     ... more users join ...               |
   |                    |                      |                    |
   |-- join group ----->|                      |                    |
   |   (last user)      |                      |                    |
   |                    |-- membership event -->|                    |
   |                    |                      |                    |
   |                    |                      |-- lookup group --->|
   |                    |                      |<-- data            |
   |                    |                      |                    |
   |                    |                      |-- update join ---->|
   |                    |                      |   count            |
   |                    |                      |                    |
   |                    |                      |   [ALL JOINED!]    |
   |                    |                      |                    |
   |                    |<-- promote all -------|                    |
   |                    |   members to          |                    |
   |                    |   super admin         |                    |
   |                    |                      |                    |
   |                    |<-- agent leaves ------|                    |
   |                    |   group               |                    |
   |                    |                      |                    |
   |                    |                      |-- update group --->|
   |                    |                      |   allJoined=true   |
   |                    |                      |   completedAt=now  |
```

### Data Transformations

| Step | Data Created / Updated |
|---|---|
| Membership event received | Agent receives `{ groupId, memberAddress }` from XMTP network |
| Group lookup | **Lookup**: `group:<groupId>` -> `{ pairingIdentifiers, joinedCount, allJoined }` |
| Join tracking | **Updated**: `group:<groupId>.joinedCount` incremented |
| | Optionally: `group:<groupId>.joinedMembers` array appended with new member address |
| Completion | **Updated**: `group:<groupId>.allJoined` = `true` |
| | **Updated**: `group:<groupId>.completedAt` = current timestamp |
| | XMTP group permissions modified: all members promoted to super admin |
| | XMTP group membership modified: agent removed |

### Error Conditions

| Condition | Handling |
|---|---|
| Agent receives event for unknown group | Log a warning and ignore. The group may have been created by another instance or directly on XMTP. |
| Promotion to super admin fails | Retry with exponential backoff. If repeated failures, log an error and alert. Do not leave the group until promotion succeeds. |
| Agent fails to leave the group | Log an error. The group is still functional (users are already super admins). Retry later or clean up manually. |
| Storage unavailable during event processing | Queue the event for retry. If using Redis, leverage Redis pub/sub or a retry queue. If in-memory, the event may be lost on restart. |
| Agent crashes and restarts | On restart, the agent should re-evaluate all groups it belongs to: check current membership counts against expected counts and process any completions that were missed. |

> **WARNING — Ambiguity**: What happens if not all users join? Is there a timeout? A cleanup mechanism? Consider:
> - A TTL on groups (e.g., if not all users join within 7 days, the agent leaves and the group is marked as expired).
> - A periodic cleanup job that checks for stale groups.
> - No cleanup at all — the agent remains in unfulfilled groups indefinitely.
>
> Without a timeout or cleanup mechanism, the agent could accumulate membership in a growing number of incomplete groups over time, potentially degrading performance.

### Security Considerations

- 🔒 **Agent permission scope**: The agent must have admin privileges in the group at creation time (to promote others and to leave). Ensure the agent's permission level is set correctly during group creation.
- 🔒 **Promotion authorization**: Only the agent should be able to promote members. Verify that the XMTP group permission model supports this and that other members cannot self-promote before the agent acts.
- 🔒 **Impersonation via group join**: If the agent only counts members (rather than verifying identities), a malicious user who obtains a QR code URL could join in place of the intended user. This would result in the wrong person being promoted to super admin.
- 🔒 **Agent key compromise**: If the agent's XMTP private key is compromised, an attacker could impersonate the agent, join groups, promote themselves, and remove the real agent. Key rotation and monitoring strategies should be in place.

---

## 5. Health & Readiness Flow

### Description

Standard Kubernetes-style liveness and readiness probes. The health endpoint confirms the process is running. The readiness endpoint confirms the service can handle requests — meaning its dependencies (storage and XMTP agent) are operational.

### Actors

| Actor | Role |
|---|---|
| **Load balancer / orchestrator** | Polls health and readiness endpoints |
| **Express server** | Responds to probe requests |
| **Storage backend** | Checked during readiness probe |
| **XMTP agent** | Checked during readiness probe |

### Step-by-Step Sequence

#### Health Check

1. The load balancer sends `GET /health`.
2. The Express server responds immediately with `200 OK` and a simple body:
   ```json
   { "status": "ok" }
   ```
3. No dependency checks are performed. If the process can respond, it is alive.

#### Readiness Check

1. The load balancer sends `GET /ready`.
2. The Express server checks each dependency:
   a. **Storage**: If Redis, send a `PING` command and expect `PONG`. If in-memory, always passes.
   b. **XMTP agent**: Check the agent's connection status (e.g., `agent.isConnected()` or equivalent).
3. If all checks pass, respond with `200 OK`:
   ```json
   { "status": "ready", "checks": { "storage": "ok", "xmtp": "ok" } }
   ```
4. If any check fails, respond with `503 Service Unavailable`:
   ```json
   { "status": "not ready", "checks": { "storage": "ok", "xmtp": "error: disconnected" } }
   ```

### Sequence Diagram

```
Load Balancer        Express Server         Storage         XMTP Agent
     |                     |                   |                |
     |-- GET /health ----->|                   |                |
     |<-- 200 {ok} --------|                   |                |
     |                     |                   |                |
     |-- GET /ready ------>|                   |                |
     |                     |-- PING ---------->|                |
     |                     |<-- PONG ---------|                |
     |                     |                   |                |
     |                     |-- isConnected? ---|--------------->|
     |                     |<-- true/false ----|----------------|
     |                     |                   |                |
     |<-- 200 {ready} ----|                   |                |
     |   or 503 {not ready}|                   |                |
```

### Data Transformations

| Step | Data |
|---|---|
| Health check | None — pure liveness signal |
| Readiness: storage ping | Redis PING/PONG round-trip (no data stored) |
| Readiness: agent status | In-memory boolean check on agent connection state |

### Error Conditions

| Condition | HTTP Status | Handling |
|---|---|---|
| Redis timeout on PING | 503 | Report storage as unhealthy |
| XMTP agent disconnected | 503 | Report XMTP as unhealthy |
| Express server unresponsive | N/A (timeout) | Load balancer marks instance as unhealthy after repeated failures |

### Security Considerations

- 🔒 **Information leakage**: Readiness responses should not expose internal hostnames, ports, or error stack traces. Keep check results to simple status strings.
- 🔒 **Endpoint exposure**: In production, `/health` and `/ready` should ideally not be exposed to the public internet. Use separate ports or path-based routing to restrict access to internal load balancers only.

---

## 6. Metrics Flow

### Description

The service collects Prometheus metrics for observability. Metrics are exposed via a dedicated endpoint for scraping by a Prometheus server.

### Actors

| Actor | Role |
|---|---|
| **Prometheus server** | Scrapes the metrics endpoint at regular intervals |
| **Express server** | Serves the metrics endpoint |
| **prom-client** | Collects and formats metrics |

### Step-by-Step Sequence

1. At service startup, `prom-client` registers:
   - **Default metrics**: process CPU usage, memory usage, event loop lag, active handles, GC statistics.
   - **Custom metrics** (examples):
     - `http_requests_total` (Counter) — labeled by method, route, status code.
     - `http_request_duration_seconds` (Histogram) — labeled by method, route.
     - `groups_created_total` (Counter) — number of groups created.
     - `authorizations_completed_total` (Counter) — successful OAuth authorizations.
     - `authorizations_failed_total` (Counter) — failed OAuth authorizations.
     - `users_joined_total` (Counter) — users who joined groups via XMTP.
     - `groups_completed_total` (Counter) — groups where all users joined and agent left.
     - `active_groups_gauge` (Gauge) — number of groups the agent is currently a member of.
2. Express middleware instruments every incoming HTTP request, recording counters and duration histograms.
3. Application code increments custom counters at relevant points (group creation, auth success, join detected, etc.).
4. The Prometheus server sends `GET /metrics`.
5. The Express server calls `prom-client.register.metrics()` to serialize all collected metrics.
6. The server responds with `200 OK` and body in Prometheus exposition format:
   ```
   # HELP http_requests_total Total HTTP requests
   # TYPE http_requests_total counter
   http_requests_total{method="GET",route="/health",status="200"} 142
   http_requests_total{method="POST",route="/api/groups",status="201"} 7
   ...
   ```

### Sequence Diagram

```
Prometheus Server     Express Server       prom-client
      |                     |                   |
      |-- GET /metrics ---->|                   |
      |                     |-- register.       |
      |                     |   metrics() ----->|
      |                     |                   |
      |                     |<-- text/plain ----|
      |                     |   (exposition     |
      |                     |    format)        |
      |<-- 200 text/plain --|                   |
      |   (metrics body)    |                   |
```

### Data Transformations

| Step | Data |
|---|---|
| Request instrumentation | Counters and histograms updated in memory (within prom-client) |
| Application events | Custom counters incremented at event time |
| Metrics scrape | In-memory metric values serialized to Prometheus text format |

### Error Conditions

| Condition | Handling |
|---|---|
| Metrics endpoint slow (high cardinality) | Keep label cardinality low; avoid using user-specific values as labels |
| prom-client memory leak (unbounded labels) | Validate that no dynamic/user-specific values are used as metric labels |

### Security Considerations

- 🔒 **Metrics endpoint exposure**: The `/metrics` endpoint can reveal information about traffic patterns, error rates, and internal behavior. It should not be publicly accessible. Restrict to internal networks or use authentication.
- 🔒 **Label injection**: Never use user-supplied input (pairing identifiers, invite IDs) as metric label values. This could cause unbounded cardinality (memory exhaustion) or label injection.

---

## 7. Error / Edge Case Flows

### 7.1 User Authorizes with a Non-Existent Pairing ID

**Scenario**: A user completes OAuth, but the Twitter handle returned by the OAuth provider does not match any pairing identifier in storage.

#### Flow

1. User completes OAuth, callback arrives at `GET /auth/callback`.
2. Connector extracts pairing identifier (e.g., `@unknown_user`).
3. Server looks up `pairing:@unknown_user` in storage.
4. Lookup returns `null`.
5. Server responds with `403 Forbidden` and renders an error page: "Your identity (@unknown_user) is not associated with any pending invite."
6. Prometheus counter `authorizations_failed_total` is incremented with label `reason="no_matching_invite"`.

```
User Browser       Express Server       Connector       OAuth Provider       Storage
     |                   |                  |                 |                  |
     |  (OAuth callback) |                  |                 |                  |
     |-- GET /auth/cb -->|                  |                 |                  |
     |                   |-- handleCB() --->|                 |                  |
     |                   |<-- "@unknown" ---|                 |                  |
     |                   |-- lookup --------|-----------------|----------------->|
     |                   |<-- null ---------|-----------------|------------------|
     |                   |                  |                 |                  |
     |<-- 403 error page |                  |                 |                  |
```

### 7.2 User Tries to Join a Group They Are Not Paired With

**Scenario**: A user obtains a QR code URL (e.g., by taking a screenshot of someone else's screen) and scans it to join the group.

#### Flow

1. The user scans the QR code and their Convos app joins the XMTP group.
2. The XMTP agent detects the new member.
3. The agent checks the new member's XMTP address against expected members.

> **WARNING — Ambiguity**: If the agent only tracks **count** of joined members (not specific identities), it cannot distinguish between an authorized user and an unauthorized one. The agent would count this as a valid join, and the group could complete with the wrong participants.
>
> If the agent **does** verify identities (via signed tokens or a stored mapping of XMTP address to pairing ID), it could:
> - Reject the unauthorized member (remove them from the group).
> - Ignore them for counting purposes.
> - Send a message indicating the user is not authorized.

```
Unauthorized User    XMTP Network         XMTP Agent           Storage
      |                   |                     |                   |
      |-- join group ---->|                     |                   |
      |   (scanned QR)    |                     |                   |
      |                   |-- member event ---->|                   |
      |                   |                     |-- lookup group -->|
      |                   |                     |<-- expected IDs --|
      |                   |                     |                   |
      |                   |                     |-- verify member   |
      |                   |                     |   against         |
      |                   |                     |   expected list   |
      |                   |                     |                   |
      |                   |                     |   [IF VERIFIED]   |
      |                   |<-- remove member ---|   (remove)        |
      |                   |                     |                   |
      |                   |                     |   [IF COUNT ONLY] |
      |                   |                     |-- increment count |
      |                   |                     |   (wrong user     |
      |                   |                     |    counted!)      |
```

### 7.3 Same User Authorizes Twice

**Scenario**: A user clicks "Authorize" a second time after already completing the flow once.

#### Flow

1. User navigates to `GET /invite/:inviteId` again.
2. Server looks up the invite and finds `status: "authorized"`.
3. **Option A (Idempotent)**: The server skips OAuth and redirects directly to the QR code page. This is user-friendly.
4. **Option B (Strict)**: The server renders a page saying "You have already authorized. Here is your QR code" with a link.
5. **Option C (Block)**: The server renders an error: "This invite has already been used." This is the most secure but least user-friendly.

> Recommendation: Option A or B is preferred. OAuth flows can be interrupted (browser closed, network issues), so users may legitimately need to re-authorize.

```
User Browser       Express Server         Storage
     |                   |                   |
     |-- GET /invite/    |                   |
     |   :inviteId ----->|                   |
     |                   |-- lookup -------->|
     |                   |<-- {status:       |
     |                   |    "authorized"}  |
     |                   |                   |
     |   [OPTION A: redirect to QR page]     |
     |<-- 302 /invite/   |                   |
     |   :id/join        |                   |
     |                   |                   |
     |   [OPTION B: show message + link]     |
     |<-- HTML "already  |                   |
     |   authorized"     |                   |
     |                   |                   |
     |   [OPTION C: block]                   |
     |<-- 403 "invite    |                   |
     |   already used"   |                   |
```

### 7.4 XMTP Agent Goes Down

**Scenario**: The XMTP agent loses connection to the network or the process crashes.

#### Flow

1. The XMTP agent loses connectivity.
2. The `GET /ready` endpoint begins returning `503` (XMTP check fails).
3. The load balancer stops routing traffic to this instance (if multiple instances).
4. **Impact on in-flight operations**:
   - Group creation (`POST /api/groups`) will fail with `503`.
   - Landing pages (`GET /invite/:inviteId`) may still be served (they only need storage).
   - OAuth callbacks can still process (they only need storage and the OAuth provider).
   - QR code generation may or may not work (depends on whether the Convos SDK requires an active agent connection).
   - **Group membership monitoring stops**: Join events will be missed.
5. When the agent reconnects:
   - The agent should re-evaluate all active groups by querying current membership.
   - Any join events that occurred during the outage should be detected by comparing current vs. stored membership counts.
   - The agent SDK may have built-in reconnection and event replay logic.

> **WARNING — Ambiguity**: Does the `@xmtp/agent-sdk` provide event replay or catch-up after reconnection? If not, the service needs its own reconciliation logic to detect missed joins.

```
                     Express Server         XMTP Agent         XMTP Network
                          |                     |                    |
                          |                     |--X disconnected X--|
                          |                     |                    |
Load Balancer             |                     |                    |
     |-- GET /ready ----->|                     |                    |
     |                    |-- isConnected? ---->|                    |
     |                    |<-- false ----------|                    |
     |<-- 503 not ready --|                     |                    |
     |                    |                     |                    |
     |  [stops routing]   |                     |                    |
     |                    |                     |                    |
     |                    |                     |-- reconnect ------>|
     |                    |                     |<-- connected ------|
     |                    |                     |                    |
     |                    |                     |-- re-evaluate ---->|
     |                    |                     |   all active       |
     |                    |                     |   groups           |
     |                    |                     |                    |
     |-- GET /ready ----->|                     |                    |
     |                    |-- isConnected? ---->|                    |
     |                    |<-- true ------------|                    |
     |<-- 200 ready ------|                     |                    |
```

### 7.5 Redis Goes Down (When Using Redis Storage)

**Scenario**: The Redis instance becomes unreachable while the service is running.

#### Flow

1. Redis becomes unreachable (network issue, instance crash, etc.).
2. The next storage operation fails with a connection error.
3. The `GET /ready` endpoint returns `503` (storage check fails).
4. **Impact on operations**:
   - `POST /api/groups` fails — cannot store group data.
   - `GET /invite/:inviteId` fails — cannot look up invite data.
   - `GET /auth/callback` fails — cannot look up or update invite status.
   - XMTP agent membership tracking fails — cannot read or update join counts.
5. The service should implement retry logic for transient Redis failures.
6. The Redis client library (e.g., `ioredis`) typically provides automatic reconnection.
7. Once Redis is available again:
   - All operations resume.
   - No data is lost (Redis persists data, assuming persistence is configured).
   - The XMTP agent should re-evaluate active groups to catch up on any missed state changes.

> **Note**: If using in-memory storage, there is no external dependency failure mode for storage. However, any process restart loses all data. In-memory storage is only suitable for development and testing.

```
Express Server         Redis              XMTP Agent
     |                   |                     |
     |-- SET key ------->|                     |
     |<-- ERROR: conn --|                     |
     |   refused         |                     |
     |                   |                     |
     |   [ready check    |                     |
     |    returns 503]   |                     |
     |                   |                     |
     |   [all storage    |                     |
     |    ops return 500]|                     |
     |                   |                     |
     |                  [Redis restarts]        |
     |                   |                     |
     |-- PING ---------->|                     |
     |<-- PONG ---------|                     |
     |                   |                     |
     |   [ready check    |                     |
     |    returns 200]   |                     |
     |                   |                     |
     |   [operations     |                     |
     |    resume]        |                     |
```

### 7.6 Concurrent Group Operations

**Scenario**: Two users from the same group authorize and join at nearly the same time.

#### Flow

1. User A and User B both scan their QR codes within seconds of each other.
2. The XMTP agent receives two membership events in rapid succession.
3. **Race condition risk**: If the agent reads the join count, increments it, and writes it back without atomicity, both events could read the same count and both write `count + 1` instead of one writing `count + 1` and the other writing `count + 2`.
4. **Mitigation strategies**:
   - Use Redis `INCR` for atomic counter increments (if using Redis storage).
   - Use a mutex or event queue to serialize membership event processing within the agent.
   - If using in-memory storage and single-threaded Node.js, the event loop naturally serializes these operations (safe as long as the read-modify-write is synchronous).
5. Even if the count is correct, the "all joined" check and subsequent promotion/leave must also be atomic. Otherwise, both events could trigger the completion logic simultaneously.

### 7.7 Invite URL Shared with Wrong Person

**Scenario**: An invite URL intended for `@user1` is accidentally (or maliciously) shared with someone else who then uses it.

#### Flow

1. The wrong person navigates to `GET /invite/:inviteId`.
2. They see the landing page (which may or may not show who the invite is for).
3. They click "Authorize" and complete OAuth with their own identity (e.g., `@wrong_user`).
4. The callback extracts `@wrong_user` as the pairing identifier.
5. The server compares `@wrong_user` with the invite's expected pairing identifier `@user1`.
6. **Mismatch detected**: The server rejects the authorization with a `403 Forbidden` response.
7. The invite remains in `"pending"` status, available for the correct user.

This is a critical security boundary. The OAuth verification step ensures that only the holder of the correct identity (Twitter account, etc.) can complete the authorization, even if the invite URL leaks.

---

## Appendix: Open Questions & Ambiguities

This section consolidates all ambiguities flagged throughout the document.

### A1. Invite URL Granularity

> **WARNING**: Is there one invite URL per group or one per pairing identifier?

**This document assumes**: One invite URL per pairing identifier. This allows each user to independently authorize and have their identity verified against a specific expected pairing ID.

**If one per group**: The authorization flow would need a different mechanism to determine which pairing identifier the authorizing user claims to represent. The OAuth result would need to be matched against the group's list of pairing identifiers.

### A2. Signed Pairing Identifier Mechanism

> **WARNING**: How does the "signed pairing identifier" work?

**Unknowns**:
- What algorithm is used (HMAC-SHA256, RSA, Ed25519, JWT)?
- What is the signing key (server secret, XMTP agent private key)?
- What is the payload (pairing identifier, group ID, timestamp, nonce)?
- How and when is it verified (by the web service, by the Convos app, by the XMTP agent)?
- Where is it transmitted (URL query parameter, cookie, XMTP message)?

**Likely implementation**: A JWT or HMAC token containing `{ pairingIdentifier, groupId, iat, exp }` signed with a server-side secret. Verified by the web service when serving the QR code page.

### A3. XMTP User to Pairing Identifier Correlation

> **WARNING**: How does the XMTP agent correlate a joining XMTP user with a pairing identifier?

**Possible approaches**:
1. **Count-based**: Agent ignores identity; it just waits for N members. Simple but insecure.
2. **Token-in-message**: User's Convos app sends the signed token as the first message; agent reads and verifies it.
3. **Pre-registered mapping**: During QR code scan, the Convos app registers the user's XMTP address with the service, which stores `xmtp-address -> pairingId`.
4. **Join metadata**: The XMTP protocol includes metadata in the join event that the agent can inspect.

**Impact**: If count-based, any XMTP user who obtains the group join URL can join and be counted. If identity-verified, only authorized users are counted.

### A4. Timeout / Cleanup for Incomplete Groups

> **WARNING**: What happens if not all users join? Is there a timeout?

**Unknowns**:
- Is there a TTL on groups or invites?
- Does the agent periodically check for stale groups?
- Is there a cleanup cron job or background task?
- Can an admin manually expire or cancel a group?

**Risks of no cleanup**:
- Agent accumulates membership in ever-growing number of groups.
- Storage fills with stale invite and group records.
- Invite URLs remain valid indefinitely (security risk).

**Recommendation**: Implement a configurable TTL (e.g., 7 days) after which:
- Invite status changes to `"expired"`.
- Landing page shows "This invite has expired."
- Agent optionally leaves the group.

### A5. Authorization for Group Creation

> **WARNING**: Who is authorized to call `POST /api/groups`?

**Unknowns**:
- Is there API key authentication?
- Is there JWT/OAuth-based authentication?
- Is there IP-based allowlisting?
- Is it completely open (no auth)?

**Recommendation**: At minimum, require an API key in the `Authorization` header. In production, consider mutual TLS or JWT with scope-based authorization.

### A6. Landing Page Content Source

> **WARNING**: How does the landing page know what to display?

**Likely answer**: The landing page route (`GET /invite/:inviteId`) looks up the invite in storage to get the `groupId`, then looks up the group metadata to get `title`, `description`, and the specific `pairingIdentifier` for this invite. All display data comes from storage.

**Follow-up questions**:
- Is the landing page server-rendered HTML or does it load a client-side app?
- Can the group creator customize the landing page (branding, colors, logo)?
- Does the page show who else is in the group or just the current user's pairing ID?

---

## End-to-End Flow Summary

The following diagram shows the complete lifecycle from group creation to completion:

```
PHASE 1: SETUP
==============
Consumer package ---> createApp(config) ---> Express server running
                                              XMTP agent connected
                                              Storage ready

PHASE 2: GROUP CREATION
========================
Admin/Service ---> POST /api/groups       ---> Group created on XMTP
                   {pairingIds, title}          Invite records stored
                                                Invite URLs returned
                                           <--- {groupId, invites[]}

PHASE 3: USER AUTHORIZATION (repeated for each user)
=====================================================
User clicks       ---> GET /invite/:id    ---> Landing page rendered
invite URL

User clicks       ---> GET /auth/authorize ---> 302 to OAuth provider
"Authorize"

User grants       ---> OAuth provider     ---> 302 back to callback
permission

Service verifies  ---> GET /auth/callback ---> Identity extracted
identity                                       Pairing ID matched
                                               Signed token created
                                               Invite status updated
                                          <--- 302 to QR code page

User sees         ---> GET /invite/:id/join --> QR code rendered
QR code

User scans QR     ---> Convos app joins   ---> XMTP group joined
                       XMTP group

PHASE 4: AGENT LIFECYCLE
=========================
XMTP agent        ---> Detects new member ---> Updates join count
monitors joins                                 Checks if all joined

                       [NOT ALL JOINED]   ---> Continue monitoring

                       [ALL JOINED]       ---> Promote all to
                                               super admin
                                          ---> Agent leaves group
                                          ---> Group marked complete

PHASE 5: STEADY STATE
======================
Group exists on XMTP with all members as super admins.
Agent is no longer a member.
Invite records remain in storage for audit/reference.
```
