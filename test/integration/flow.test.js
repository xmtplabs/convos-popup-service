import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../lib/utils/fetchIcon.js', () => ({
  fetchIcon: vi.fn().mockResolvedValue({
    contentType: 'image/png',
    data: Buffer.from('fake-icon-data'),
  }),
}));
import request from 'supertest';
import { createTestConfig } from '../helpers/setup.js';
import { createLogger } from '../../lib/logger.js';
import { MemoryStorage } from '../../lib/storage/memory-storage.js';
import { MockAgent } from '../../lib/agent/mock-agent.js';
import { createApp } from '../../lib/app.js';
import { createNotifier } from '../../lib/notifications.js';

const config = createTestConfig();
const logger = createLogger(config);

describe('end-to-end flow', () => {
  let app, storage, agent;

  beforeEach(async () => {
    storage = new MemoryStorage();
    agent = new MockAgent();
    await agent.init();
    const notifier = createNotifier(config, logger);
    app = createApp({ config, storage, agent, logger, metrics: null, notifier });
  });

  afterEach(async () => {
    await agent.close();
    await storage.close();
  });

  it('full flow: register → approve → token → create group → invite → verify → QR', async () => {
    // 1. Register namespace
    const regRes = await request(app)
      .post('/connect/register')
      .send({
        namespace: 'x-twitter',
        displayName: 'X/Twitter',
        verificationEndpoint: 'https://connect.example.com/verify',
        appIconUrl: 'https://example.com/icon.png',
        contactEmail: 'ops@example.com',
      });

    expect(regRes.status).toBe(202);
    const { clientId, clientSecret } = regRes.body;

    // 2. Approve namespace
    const approvalTokens = [...storage.approvalTokens.entries()];
    const [rawToken] = approvalTokens[0];
    const { signApprovalToken } = await import('../../lib/auth/tokens.js');
    const signedApproval = await signApprovalToken(config, {
      namespace: 'x-twitter',
      token: rawToken,
    });

    const approveRes = await request(app).get(`/connect/approve/${signedApproval}`);
    expect(approveRes.status).toBe(200);

    // 3. Exchange credentials for token
    const tokenRes = await request(app)
      .post('/auth/token')
      .type('form')
      .send(`grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`);

    expect(tokenRes.status).toBe(200);
    const accessToken = tokenRes.body.access_token;

    // 4. Create group
    const groupRes = await request(app)
      .post('/api/v1/namespaces/x-twitter/groups')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Chat between @alice and @bob',
        pairingIdentifiers: ['@alice', '@bob'],
      });

    expect(groupRes.status).toBe(201);
    expect(groupRes.body.inviteId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(groupRes.body.inviteUrl).toContain('/invite/');
    expect(groupRes.body.pairingIdentifiers).toEqual(['@alice', '@bob']);
    const { inviteId } = groupRes.body;

    // 5. Visit invite page — shows group title, not pairing ID
    const inviteRes = await request(app).get(`/invite/x-twitter/${inviteId}`);
    expect(inviteRes.status).toBe(200);
    expect(inviteRes.text).toContain('Chat between @alice and @bob');
    expect(inviteRes.text).toContain('X/Twitter');

    // 6. Vouch for @alice
    const verifyRes = await request(app)
      .post('/api/v1/namespaces/x-twitter/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        pairingIdentifier: '@alice',
        inviteId,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.redirectUrl).toContain('/join/');

    // 7. Vouch for @bob with the same invite
    const verifyRes2 = await request(app)
      .post('/api/v1/namespaces/x-twitter/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        pairingIdentifier: '@bob',
        inviteId,
      });

    expect(verifyRes2.status).toBe(200);
    expect(verifyRes2.body.redirectUrl).toContain('/join/');

    // 8. @alice again gets 409
    const verifyRes3 = await request(app)
      .post('/api/v1/namespaces/x-twitter/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        pairingIdentifier: '@alice',
        inviteId,
      });

    expect(verifyRes3.status).toBe(409);
    expect(verifyRes3.body.error).toBe('already_verified');

    // 9. @charlie gets 404 (not in group)
    const verifyRes4 = await request(app)
      .post('/api/v1/namespaces/x-twitter/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        pairingIdentifier: '@charlie',
        inviteId,
      });

    expect(verifyRes4.status).toBe(404);

    // 10. Visit QR code page — must encode agent's invite URL
    const redirectUrl = new URL(verifyRes.body.redirectUrl);
    const joinPath = redirectUrl.pathname + '?t=' + redirectUrl.searchParams.get('t');
    const qrRes = await request(app).get(joinPath);
    expect(qrRes.status).toBe(200);
    expect(qrRes.text).toContain('Scan to join');
    expect(qrRes.headers['referrer-policy']).toBe('no-referrer');

    // Verify the page contains the exact agent invite URL
    const storedGroup = await storage.getGroup(groupRes.body.groupId);
    const agentInviteUrl = storedGroup.inviteCodes['@alice'].joinUrl;
    expect(agentInviteUrl).toContain('convos.example.com');
    expect(qrRes.text).toContain(agentInviteUrl);
  });

  it('enforces namespace isolation', async () => {
    // Register two namespaces
    const reg1 = await request(app)
      .post('/connect/register')
      .send({
        namespace: 'x-twitter',
        displayName: 'X/Twitter',
        verificationEndpoint: 'https://twitter-connect.example.com/verify',
        appIconUrl: 'https://example.com/icon.png',
        contactEmail: 'ops@example.com',
      });
    const reg2 = await request(app)
      .post('/connect/register')
      .send({
        namespace: 'discord-test',
        displayName: 'Discord',
        verificationEndpoint: 'https://discord-connect.example.com/verify',
        appIconUrl: 'https://discord-connect.example.com/icon.png',
        contactEmail: 'discord@example.com',
      });

    // Approve both
    for (const [rawToken, data] of storage.approvalTokens.entries()) {
      if (data.consumed) continue;
      const { signApprovalToken } = await import('../../lib/auth/tokens.js');
      const signed = await signApprovalToken(config, {
        namespace: data.namespace,
        token: rawToken,
      });
      await request(app).get(`/connect/approve/${signed}`);
    }

    // Get token for x-twitter
    const tokenRes = await request(app)
      .post('/auth/token')
      .type('form')
      .send(`grant_type=client_credentials&client_id=${reg1.body.clientId}&client_secret=${reg1.body.clientSecret}`);
    const twitterToken = tokenRes.body.access_token;

    // Try to create group in discord namespace with twitter token
    const groupRes = await request(app)
      .post('/api/v1/namespaces/discord-test/groups')
      .set('Authorization', `Bearer ${twitterToken}`)
      .send({
        title: 'Cross-namespace test',
        pairingIdentifiers: ['@alice', '@bob'],
      });

    expect(groupRes.status).toBe(403);
    expect(groupRes.body.error).toBe('namespace_mismatch');
  });
});
