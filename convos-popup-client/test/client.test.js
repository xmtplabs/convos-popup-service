import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../lib/utils/fetchIcon.js', () => ({
  fetchIcon: vi.fn().mockResolvedValue({
    contentType: 'image/png',
    data: Buffer.from('fake-icon-data'),
  }),
}));

import { createTestConfig } from '../../test/helpers/setup.js';
import { createLogger } from '../../lib/logger.js';
import { MemoryStorage } from '../../lib/storage/memory-storage.js';
import { MockAgent } from '../../lib/agent/mock-agent.js';
import { createApp } from '../../lib/app.js';
import { createNotifier } from '../../lib/notifications.js';
import { signApprovalToken } from '../../lib/auth/tokens.js';
import { ConvosPopupClient, PopupServiceError } from '../index.js';

describe('ConvosPopupClient', () => {
  let server, baseUrl, storage, agent, config;

  beforeAll(async () => {
    config = createTestConfig();
    storage = new MemoryStorage();
    agent = new MockAgent();
    await agent.init();
    const logger = createLogger(config);
    const notifier = createNotifier(config, logger);
    const app = createApp({ config, storage, agent, logger, metrics: null, notifier });

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        config = createTestConfig({ BASE_URL: baseUrl });
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await agent.close();
    await storage.close();
  });

  async function approveNamespace(namespace) {
    for (const [rawToken, data] of storage.approvalTokens.entries()) {
      if (data.consumed || data.namespace !== namespace) continue;
      const signed = await signApprovalToken(config, { namespace, token: rawToken });
      await fetch(`${baseUrl}/connect/approve/${signed}`);
      return;
    }
  }

  async function registerAndApprove(opts = {}) {
    const client = new ConvosPopupClient({ baseUrl });
    await client.register({
      namespace: opts.namespace || 'x-twitter',
      displayName: opts.displayName || 'X/Twitter',
      verificationEndpoint: 'https://connect.example.com/verify',
      appIconUrl: 'https://example.com/icon.png',
      contactEmail: 'ops@example.com',
    });
    await approveNamespace(client.namespace);
    return client;
  }

  it('register() creates namespace and populates client credentials', async () => {
    const client = new ConvosPopupClient({ baseUrl });
    const result = await client.register({
      namespace: 'test-register',
      displayName: 'Test',
      verificationEndpoint: 'https://connect.example.com/verify',
      appIconUrl: 'https://example.com/icon.png',
      contactEmail: 'test@example.com',
    });

    expect(result.clientId).toMatch(/^cps_/);
    expect(result.clientSecret).toMatch(/^cps_secret_/);
    expect(result.namespace).toBe('test-register');
    expect(client.namespace).toBe('test-register');
    expect(client.clientId).toBe(result.clientId);
    expect(client.clientSecret).toBe(result.clientSecret);
  });

  it('createGroup() returns group with inviteUrl', async () => {
    const client = await registerAndApprove({ namespace: 'test-create-group' });
    const group = await client.createGroup({
      title: 'Chat between @alice and @bob',
      pairingIdentifiers: ['@alice', '@bob'],
    });

    expect(group.groupId).toBeTruthy();
    expect(group.inviteId).toMatch(/^inv_/);
    expect(group.inviteUrl).toContain('/invite/');
    expect(group.inviteUrl).toContain('test-create-group');
    expect(group.pairingIdentifiers).toEqual(['@alice', '@bob']);
    expect(group.createdAt).toBeTruthy();
  });

  it('verifyUser() returns redirectUrl', async () => {
    const client = await registerAndApprove({ namespace: 'test-verify-user' });
    const group = await client.createGroup({
      title: 'Verify test',
      pairingIdentifiers: ['@alice', '@bob'],
    });

    const result = await client.verifyUser({
      pairingIdentifier: '@alice',
      inviteId: group.inviteId,
    });

    expect(result.status).toBe('verified');
    expect(result.redirectUrl).toContain('/join/');
    expect(result.expiresAt).toBeTruthy();
  });

  it('verifyUser() duplicate throws PopupServiceError with status 409', async () => {
    const client = await registerAndApprove({ namespace: 'test-verify-dup' });
    const group = await client.createGroup({
      title: 'Dup test',
      pairingIdentifiers: ['@alice', '@bob'],
    });

    await client.verifyUser({
      pairingIdentifier: '@alice',
      inviteId: group.inviteId,
    });

    const err = await client.verifyUser({
      pairingIdentifier: '@alice',
      inviteId: group.inviteId,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(PopupServiceError);
    expect(err.status).toBe(409);
    expect(err.error).toBe('already_verified');
    expect(err.redirectUrl).toContain('/join/');
  });

  it('getGroup() returns expected shape', async () => {
    const client = await registerAndApprove({ namespace: 'test-get-group' });
    const created = await client.createGroup({
      title: 'Get group test',
      pairingIdentifiers: ['@alice', '@bob'],
    });

    const group = await client.getGroup(created.groupId);

    expect(group.groupId).toBe(created.groupId);
    expect(group.namespace).toBe('test-get-group');
    expect(group.exists).toBe(true);
    expect(group.createdAt).toBeTruthy();
  });

  it('isGroupReady() returns expected shape', async () => {
    const client = await registerAndApprove({ namespace: 'test-group-ready' });
    const created = await client.createGroup({
      title: 'Ready test',
      pairingIdentifiers: ['@alice', '@bob'],
    });

    const result = await client.isGroupReady(created.groupId);

    expect(result.groupId).toBe(created.groupId);
    expect(typeof result.ready).toBe('boolean');
  });

  it('rotateSecret() returns new secret and old secret still works during grace period', async () => {
    const client = await registerAndApprove({ namespace: 'test-rotate' });
    const oldSecret = client.clientSecret;

    const result = await client.rotateSecret();

    expect(result.clientId).toBe(client.clientId);
    expect(result.clientSecret).not.toBe(oldSecret);
    expect(result.previousSecretExpiresAt).toBeTruthy();
    expect(client.clientSecret).toBe(result.clientSecret);

    // New secret works (createGroup triggers token exchange)
    const group = await client.createGroup({
      title: 'Post-rotate test',
      pairingIdentifiers: ['@alice', '@bob'],
    });
    expect(group.groupId).toBeTruthy();

    // Old secret still works during grace period
    const oldClient = new ConvosPopupClient({
      baseUrl,
      namespace: 'test-rotate',
      clientId: client.clientId,
      clientSecret: oldSecret,
    });
    const group2 = await oldClient.createGroup({
      title: 'Grace period test',
      pairingIdentifiers: ['@carol', '@dave'],
    });
    expect(group2.groupId).toBeTruthy();
  });

  it('updateNamespace() returns updated fields', async () => {
    const client = await registerAndApprove({ namespace: 'test-update-ns' });

    const result = await client.updateNamespace({ displayName: 'Updated Name' });

    expect(result.namespace).toBe('test-update-ns');
    expect(result.displayName).toBe('Updated Name');
  });

  it('invalid credentials throw PopupServiceError with status 401', async () => {
    const client = new ConvosPopupClient({
      baseUrl,
      namespace: 'nonexistent',
      clientId: 'cps_bad',
      clientSecret: 'cps_secret_bad',
    });

    const err = await client.createGroup({
      title: 'Fail',
      pairingIdentifiers: ['@alice', '@bob'],
    }).catch((e) => e);

    expect(err).toBeInstanceOf(PopupServiceError);
    expect(err.status).toBe(401);
  });
});
