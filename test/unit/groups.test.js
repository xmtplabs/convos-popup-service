import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestConfig } from '../helpers/setup.js';
import { MemoryStorage } from '../../lib/storage/memory-storage.js';
import { MockAgent } from '../../lib/agent/mock-agent.js';
import { groupRoutes } from '../../lib/routes/groups.js';
import { signAccessToken } from '../../lib/auth/tokens.js';
import { createBearerAuth } from '../../lib/middleware/bearerAuth.js';
import { namespaceEnforcement } from '../../lib/middleware/namespaceEnforcement.js';

const config = createTestConfig();

describe('group routes', () => {
  let app, storage, token, agent;

  beforeEach(async () => {
    storage = new MemoryStorage();
    agent = new MockAgent();
    await agent.init();
    app = express();
    app.use(express.json());

    const bearerAuth = createBearerAuth(config, storage);
    app.use(
      '/api/v1/namespaces/:namespace/groups',
      bearerAuth,
      namespaceEnforcement(),
      groupRoutes(config, storage, agent, null),
    );

    token = await signAccessToken(config, {
      clientId: 'cps_live_test',
      namespace: 'x-twitter',
      scope: 'groups:write pairing:write verify:write',
    });
  });

  afterEach(async () => {
    await agent.close();
  });

  describe('POST /api/v1/namespaces/:namespace/groups', () => {
    it('creates a group with 201 and a single invite', async () => {
      const res = await request(app)
        .post('/api/v1/namespaces/x-twitter/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test Group',
          pairingIdentifiers: ['@alice', '@bob'],
        });

      expect(res.status).toBe(201);
      expect(res.body.groupId).toMatch(/^grp_/);
      expect(res.body.inviteId).toMatch(/^inv_/);
      expect(res.body.inviteUrl).toContain('/invite/');
      expect(res.body.pairingIdentifiers).toEqual(['@alice', '@bob']);
      expect(res.body.invites).toBeUndefined();
    });

    it('returns 400 for missing pairingIdentifiers', async () => {
      const res = await request(app)
        .post('/api/v1/namespaces/x-twitter/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation_error');
    });

    it('returns 400 for fewer than 2 pairing identifiers', async () => {
      const res = await request(app)
        .post('/api/v1/namespaces/x-twitter/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Test', pairingIdentifiers: ['@alice'] });

      expect(res.status).toBe(400);
    });

    it('returns 403 for namespace mismatch', async () => {
      const res = await request(app)
        .post('/api/v1/namespaces/discord/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          pairingIdentifiers: ['@alice', '@bob'],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('namespace_mismatch');
    });

    it('stores per-user inviteCodes when agent is available', async () => {
      const agentStorage = new MemoryStorage();
      const agent = new MockAgent();
      await agent.init();

      const agentApp = express();
      agentApp.use(express.json());
      const bearerAuth2 = createBearerAuth(config, agentStorage);
      agentApp.use(
        '/api/v1/namespaces/:namespace/groups',
        bearerAuth2,
        namespaceEnforcement(),
        groupRoutes(config, agentStorage, agent, null),
      );

      const agentToken = await signAccessToken(config, {
        clientId: 'cps_live_test',
        namespace: 'x-twitter',
        scope: 'groups:write pairing:write verify:write',
      });

      const res = await request(agentApp)
        .post('/api/v1/namespaces/x-twitter/groups')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          title: 'Agent Group',
          pairingIdentifiers: ['@alice', '@bob'],
        });

      expect(res.status).toBe(201);

      const group = await agentStorage.getGroup(res.body.groupId);
      expect(group.inviteCodes).toBeTruthy();
      expect(group.inviteCodes['@alice'].joinUrl).toBeTruthy();
      expect(group.inviteCodes['@bob'].joinUrl).toBeTruthy();
      expect(group.inviteCodes['@alice'].code).toMatch(/^pc_/);

      await agent.close();
    });
  });

  describe('GET /api/v1/namespaces/:namespace/groups/:groupId/ready', () => {
    it('returns readiness status', async () => {
      // Create a group first
      const createRes = await request(app)
        .post('/api/v1/namespaces/x-twitter/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test',
          pairingIdentifiers: ['@alice', '@bob'],
        });

      const { groupId } = createRes.body;

      const res = await request(app)
        .get(`/api/v1/namespaces/x-twitter/groups/${groupId}/ready`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(false);
    });

    it('returns 404 for unknown group', async () => {
      const res = await request(app)
        .get('/api/v1/namespaces/x-twitter/groups/grp_unknown/ready')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
