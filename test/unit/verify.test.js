import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestConfig } from '../helpers/setup.js';
import { MemoryStorage } from '../../lib/storage/memory-storage.js';
import { verifyRoutes } from '../../lib/routes/verify.js';
import { signAccessToken } from '../../lib/auth/tokens.js';
import { createBearerAuth } from '../../lib/middleware/bearerAuth.js';
import { namespaceEnforcement } from '../../lib/middleware/namespaceEnforcement.js';

const config = createTestConfig();

describe('verify routes', () => {
  let app, storage, token;

  beforeEach(async () => {
    storage = new MemoryStorage();
    app = express();
    app.use(express.json());

    const bearerAuth = createBearerAuth(config, storage);
    app.use(
      '/api/v1/namespaces/:namespace/verify',
      bearerAuth,
      namespaceEnforcement(),
      verifyRoutes(config, storage, null),
    );

    token = await signAccessToken(config, {
      clientId: 'cps_live_test',
      namespace: 'x-twitter',
      scope: 'groups:write pairing:write verify:write',
    });

    // Create a group with pairing identifiers and a single invite
    await storage.createGroup('grp_1', {
      namespace: 'x-twitter',
      title: 'Test',
      pairingIdentifiers: ['@alice', '@bob'],
    });
    await storage.createInvite('inv_1', {
      namespace: 'x-twitter',
      groupId: 'grp_1',
    });
  });

  it('vouches for a user and returns redirectUrl', async () => {
    const res = await request(app)
      .post('/api/v1/namespaces/x-twitter/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ pairingIdentifier: '@alice', inviteId: 'inv_1' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('verified');
    expect(res.body.redirectUrl).toContain('/join/');
    expect(res.body.expiresAt).toBeDefined();
  });

  it('different pairing IDs verify with same invite', async () => {
    const res1 = await request(app)
      .post('/api/v1/namespaces/x-twitter/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ pairingIdentifier: '@alice', inviteId: 'inv_1' });

    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post('/api/v1/namespaces/x-twitter/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ pairingIdentifier: '@bob', inviteId: 'inv_1' });

    expect(res2.status).toBe(200);
    expect(res2.body.status).toBe('verified');
    expect(res2.body.redirectUrl).toContain('/join/');
  });

  it('returns 404 for unknown invite', async () => {
    const res = await request(app)
      .post('/api/v1/namespaces/x-twitter/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ pairingIdentifier: '@alice', inviteId: 'inv_unknown' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('invite_not_found');
  });

  it('returns 404 for unknown pairing identifier', async () => {
    const res = await request(app)
      .post('/api/v1/namespaces/x-twitter/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ pairingIdentifier: '@charlie', inviteId: 'inv_1' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('invite_not_found');
  });

  it('returns 409 for already verified', async () => {
    await request(app)
      .post('/api/v1/namespaces/x-twitter/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ pairingIdentifier: '@alice', inviteId: 'inv_1' });

    const res = await request(app)
      .post('/api/v1/namespaces/x-twitter/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ pairingIdentifier: '@alice', inviteId: 'inv_1' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_verified');
    expect(res.body.redirectUrl).toBeDefined();
  });
});
