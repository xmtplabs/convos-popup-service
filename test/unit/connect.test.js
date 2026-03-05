import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../lib/utils/fetchIcon.js', () => ({
  fetchIcon: vi.fn().mockResolvedValue({
    contentType: 'image/png',
    data: Buffer.from('fake-icon-data'),
  }),
}));
import express from 'express';
import request from 'supertest';
import { createTestConfig } from '../helpers/setup.js';
import { FIXTURES } from '../helpers/fixtures.js';
import { MemoryStorage } from '../../lib/storage/MemoryStorage.js';
import { connectRoutes } from '../../lib/routes/connect.js';
import { createBearerAuth } from '../../lib/middleware/bearerAuth.js';
import { signAccessToken } from '../../lib/auth/tokens.js';

const config = createTestConfig();

describe('connect routes', () => {
  let app, storage;

  beforeEach(() => {
    storage = new MemoryStorage();
    app = express();
    app.use(express.json());

    const bearerAuth = createBearerAuth(config, storage);
    const routes = connectRoutes(config, storage, null);

    // The register and approve routes are public
    app.post('/connect/register', routes);
    app.get('/connect/approve/:approvalToken', routes);
    // rotate-secret and patch need auth
    app.use('/connect', bearerAuth, routes);
    app.use(routes);
  });

  describe('POST /connect/register', () => {
    it('returns 202 with credentials', async () => {
      const res = await request(app)
        .post('/connect/register')
        .send(FIXTURES.namespace.valid);
      expect(res.status).toBe(202);
      expect(res.body.clientId).toMatch(/^cps_live_/);
      expect(res.body.clientSecret).toMatch(/^cps_secret_/);
      expect(res.body.namespace).toBe('x-twitter');
      expect(res.body.status).toBe('pending_approval');
    });

    it('returns 409 for duplicate namespace', async () => {
      await request(app).post('/connect/register').send(FIXTURES.namespace.valid);
      const res = await request(app).post('/connect/register').send(FIXTURES.namespace.valid);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('namespace_exists');
    });

    it('returns 400 for reserved namespace', async () => {
      const res = await request(app)
        .post('/connect/register')
        .send({ ...FIXTURES.namespace.valid, namespace: 'admin' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid format', async () => {
      const res = await request(app)
        .post('/connect/register')
        .send({ ...FIXTURES.namespace.valid, namespace: 'UPPERCASE' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /connect/approve/:approvalToken', () => {
    it('approves a pending namespace', async () => {
      const regRes = await request(app)
        .post('/connect/register')
        .send(FIXTURES.namespace.valid);
      expect(regRes.status).toBe(202);

      // Get the approval tokens from storage
      const ns = await storage.getNamespace('x-twitter');
      expect(ns.status).toBe('pending_approval');

      // Find the signed approval token — we need to extract from the stored data
      // The approval URL is logged by the notifier, but we can find the token via storage
      const approvalTokens = [...storage.approvalTokens.entries()];
      expect(approvalTokens).toHaveLength(1);
      const [rawToken] = approvalTokens[0];

      // Sign it like the register route does
      const { signApprovalToken } = await import('../../lib/auth/tokens.js');
      const signed = await signApprovalToken(config, { namespace: 'x-twitter', token: rawToken });

      const res = await request(app).get(`/connect/approve/${signed}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Namespace Approved');

      // Verify namespace is now active
      const updatedNs = await storage.getNamespace('x-twitter');
      expect(updatedNs.status).toBe('active');
    });

    it('rejects used approval token', async () => {
      await request(app).post('/connect/register').send(FIXTURES.namespace.valid);
      const approvalTokens = [...storage.approvalTokens.entries()];
      const [rawToken] = approvalTokens[0];

      const { signApprovalToken } = await import('../../lib/auth/tokens.js');
      const signed = await signApprovalToken(config, { namespace: 'x-twitter', token: rawToken });

      await request(app).get(`/connect/approve/${signed}`);
      const res = await request(app).get(`/connect/approve/${signed}`);
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /connect/namespace', () => {
    it('updates namespace details', async () => {
      // Register and activate
      const regRes = await request(app).post('/connect/register').send(FIXTURES.namespace.valid);
      await storage.activateNamespace('x-twitter');

      const token = await signAccessToken(config, {
        clientId: regRes.body.clientId,
        namespace: 'x-twitter',
        scope: 'groups:write pairing:write verify:write',
      });

      const res = await request(app)
        .patch('/connect/namespace')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'X (formerly Twitter)' });

      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('X (formerly Twitter)');
    });
  });
});
