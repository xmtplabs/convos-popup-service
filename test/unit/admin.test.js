import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestConfig } from '../helpers/setup.js';
import { MemoryStorage } from '../../lib/storage/MemoryStorage.js';
import { adminRoutes } from '../../lib/routes/admin.js';
import { authRoutes } from '../../lib/routes/auth.js';
import { hashSecret } from '../../lib/auth/credentials.js';
import { createTestLogger } from '../helpers/setup.js';

const config = createTestConfig();
const logger = createTestLogger();

describe('admin routes', () => {
  let app, storage;
  const clientId = 'cps_live_admin_test';
  const clientSecret = 'cps_secret_admin_test';

  beforeEach(async () => {
    storage = new MemoryStorage();
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use('/admin', adminRoutes(config, storage, logger));
    app.use(authRoutes(config, storage, null));

    const hash = await hashSecret(clientSecret);
    await storage.createNamespace({ namespace: 'x-twitter', clientId, displayName: 'X' });
    await storage.activateNamespace('x-twitter');
    await storage.storeClientCredentials(clientId, { secretHash: hash, namespace: 'x-twitter' });

    // Create some invites
    await storage.createInvite('inv_1', { namespace: 'x-twitter', pairingIdentifier: '@alice', groupId: 'grp_1' });
  });

  it('revokes a client', async () => {
    const res = await request(app)
      .post('/admin/revoke-client')
      .set('Authorization', `Bearer ${config.adminToken}`)
      .send({ clientId, reason: 'Suspected compromise' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('revoked');

    // Verify token exchange is blocked
    const tokenRes = await request(app)
      .post('/auth/token')
      .type('form')
      .send(`grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`);
    expect(tokenRes.status).toBe(401);
  });

  it('returns 401 without admin token', async () => {
    const res = await request(app)
      .post('/admin/revoke-client')
      .send({ clientId });
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown client', async () => {
    const res = await request(app)
      .post('/admin/revoke-client')
      .set('Authorization', `Bearer ${config.adminToken}`)
      .send({ clientId: 'cps_live_unknown' });
    expect(res.status).toBe(404);
  });
});
