# convos-popup-client

Node.js client for the Convos popup service API. Wraps namespace registration, group creation, user verification, and credential management behind async methods. Handles OAuth token exchange and caching internally — callers never touch tokens.

Requires Node 18+ (uses built-in `fetch`). Zero dependencies.

## Install

```
npm install convos-popup-client
```

## Quickstart

```js
import { ConvosPopupClient } from 'convos-popup-client';

const client = new ConvosPopupClient({
  baseUrl: 'https://popup.convos.org',
  namespace: 'x-twitter',
  clientId: 'cps_live_...',
  clientSecret: 'cps_secret_...',
});

const group = await client.createGroup({
  title: 'Chat between @alice and @bob',
  pairingIdentifiers: ['@alice', '@bob'],
});

const result = await client.verifyUser({
  pairingIdentifier: '@alice',
  inviteId: group.inviteId,
});
// result.redirectUrl → send the user here
```

## Methods

### `register({ namespace, displayName, verificationEndpoint, appIconUrl, contactEmail })`

Registers a new namespace with the popup service. On success, the client's `namespace`, `clientId`, and `clientSecret` properties are populated automatically. Use this instead of passing credentials to the constructor when setting up a new integration.

Returns `{ clientId, clientSecret, namespace, status, tokenEndpoint, createdAt }`.

### `createGroup({ title, pairingIdentifiers })`

Creates a conversation group. `pairingIdentifiers` is an array of at least 2 user identifiers (e.g. `['@alice', '@bob']`).

Returns `{ groupId, inviteId, inviteUrl, pairingIdentifiers, createdAt }`.

### `verifyUser({ pairingIdentifier, inviteId })`

Vouches that a user has been verified by your service. Call this after your verification flow confirms the user's identity.

Returns `{ status, redirectUrl, expiresAt }`. Send the user to `redirectUrl`.

### `getGroup(groupId)`

Returns `{ groupId, namespace, exists, createdAt }`.

### `isGroupReady(groupId)`

Returns `{ groupId, ready }`. Poll this to check if all members have joined.

### `rotateSecret()`

Rotates the client secret. The old secret remains valid for a grace period. The client instance updates its stored secret automatically.

Returns `{ clientId, clientSecret, previousSecretExpiresAt }`.

### `updateNamespace(fields)`

Updates registration details. Pass any subset of `{ displayName, verificationEndpoint, appIconUrl, contactEmail }`.

Returns the updated namespace record.

## Error handling

All methods throw `PopupServiceError` on non-2xx responses. The error has `status`, `error`, and `body` properties.

```js
import { PopupServiceError } from 'convos-popup-client';

try {
  await client.verifyUser({ pairingIdentifier: '@alice', inviteId });
} catch (err) {
  if (err instanceof PopupServiceError && err.status === 409) {
    // Already verified — err.redirectUrl has the join URL
  }
}
```
