import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestConfig } from '../helpers/setup.js';
import { MemoryStorage } from '../../lib/storage/MemoryStorage.js';
import { authRoutes } from '../../lib/routes/auth.js';
import { hashSecret } from '../../lib/auth/credentials.js';

const config = createTestConfig();

describe('POST /auth/token', () => {
  let app, storage;
  const clientId = 'cps_live_test123';
  const clientSecret = 'cps_secret_test456';

  beforeEach(async () => {
    storage = new MemoryStorage();
    app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use(authRoutes(config, storage, null));

    // Set up a registered, active namespace
    const secretHash = await hashSecret(clientSecret);
    await storage.createNamespace({
      namespace: 'x-twitter',
      clientId,
      displayName: 'X/Twitter',
    });
    await storage.activateNamespace('x-twitter');
    await storage.storeClientCredentials(clientId, { secretHash, namespace: 'x-twitter' });
  });

  it('returns access token for valid credentials', async () => {
    const res = await request(app)
      .post('/auth/token')
      .type('form')
      .send(`grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`);

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.token_type).toBe('Bearer');
    expect(res.body.expires_in).toBe(3600);
    expect(res.body.scope).toContain('groups:write');
  });

  it('returns 401 for invalid credentials', async () => {
    const res = await request(app)
      .post('/auth/token')
      .type('form')
      .send(`grant_type=client_credentials&client_id=${clientId}&client_secret=wrong`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_client');
  });

  it('returns 403 for pending namespace', async () => {
    // Create a new pending namespace
    const pendingId = 'cps_live_pending';
    const pendingSecret = 'cps_secret_pending';
    const hash = await hashSecret(pendingSecret);
    await storage.createNamespace({ namespace: 'pending-ns', clientId: pendingId });
    await storage.storeClientCredentials(pendingId, { secretHash: hash, namespace: 'pending-ns' });

    const res = await request(app)
      .post('/auth/token')
      .type('form')
      .send(`grant_type=client_credentials&client_id=${pendingId}&client_secret=${pendingSecret}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('namespace_pending_approval');
  });

  it('returns 423 after lockout', async () => {
    // Fail 10 times
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/auth/token')
        .type('form')
        .send(`grant_type=client_credentials&client_id=${clientId}&client_secret=wrong`);
    }

    const res = await request(app)
      .post('/auth/token')
      .type('form')
      .send(`grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`);

    expect(res.status).toBe(423);
    expect(res.body.error).toBe('client_locked');
  });

  it('accepts grace period secret', async () => {
    const newSecret = 'cps_secret_new';
    const newHash = await hashSecret(newSecret);
    const oldHash = (await storage.getClientCredentials(clientId)).secretHash;
    const graceExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await storage.updateClientSecretHash(clientId, newHash, oldHash, graceExpiresAt);

    // Old secret should still work during grace period
    const res = await request(app)
      .post('/auth/token')
      .type('form')
      .send(`grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`);

    expect(res.status).toBe(200);

    // New secret should also work
    const res2 = await request(app)
      .post('/auth/token')
      .type('form')
      .send(`grant_type=client_credentials&client_id=${clientId}&client_secret=${newSecret}`);

    expect(res2.status).toBe(200);
  });
});
