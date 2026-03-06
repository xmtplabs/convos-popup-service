import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createTestConfig } from '../helpers/setup.js';
import { MemoryStorage } from '../../lib/storage/memory-storage.js';
import { inviteRoutes } from '../../lib/routes/invite.js';
import { joinRoutes } from '../../lib/routes/join.js';
import { signJoinToken } from '../../lib/auth/tokens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = createTestConfig();

function createPageApp(storage) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.resolve(__dirname, '../../lib/views'));
  app.use(inviteRoutes(config, storage));
  app.use(joinRoutes(config, storage));
  return app;
}

describe('page routes', () => {
  let storage;

  beforeEach(async () => {
    storage = new MemoryStorage();

    await storage.createNamespace({
      namespace: 'x-twitter',
      displayName: 'X/Twitter',
      verificationEndpoint: 'https://connect.example.com/verify',
      clientId: 'cps_live_test',
    });
    await storage.activateNamespace('x-twitter');

    await storage.createGroup('grp_1', {
      namespace: 'x-twitter',
      title: 'Test Group',
      pairingIdentifiers: ['@alice', '@bob'],
      inviteCodes: {
        '@alice': { code: 'pc_aaa', joinUrl: 'https://convos.example.com/join/grp_1/alice_invite' },
        '@bob': { code: 'pc_bbb', joinUrl: 'https://convos.example.com/join/grp_1/bob_invite' },
      },
    });
    await storage.createInvite('inv_1', {
      namespace: 'x-twitter',
      groupId: 'grp_1',
    });
  });

  describe('GET /invite/:inviteId', () => {
    it('renders landing page with group title', async () => {
      const app = createPageApp(storage);
      const res = await request(app).get('/invite/inv_1');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Test Group');
      expect(res.text).toContain('X/Twitter');
      expect(res.text).toContain('Verify your identity');
      expect(res.text).toContain('<img src="/icons/x-twitter"');
    });

    it('returns 404 for unknown invite', async () => {
      const app = createPageApp(storage);
      const res = await request(app).get('/invite/inv_unknown');
      expect(res.status).toBe(404);
      expect(res.text).toContain('Invite Not Found');
    });

    it('shows unavailable when health check fails', async () => {
      await storage.setHealthCheckResult('x-twitter', false);
      const app = createPageApp(storage);
      const res = await request(app).get('/invite/inv_1');
      expect(res.status).toBe(200);
      expect(res.text).toContain('temporarily unavailable');
    });
  });

  describe('GET /join/:joinToken', () => {
    it('renders QR code page for valid token', async () => {
      const jti = 'tok_test123';
      const signedToken = await signJoinToken(config, {
        sub: '@alice',
        groupId: 'grp_1',
        inviteId: 'inv_1',
        namespace: 'x-twitter',
        jti,
      });
      await storage.storeJoinToken(jti, {
        groupId: 'grp_1',
        inviteId: 'inv_1',
        namespace: 'x-twitter',
        pairingIdentifier: '@alice',
      });

      const app = createPageApp(storage);
      const res = await request(app).get(`/join/${jti}?t=${signedToken}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Scan to join group');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    });

    it('returns 403 for expired token', async () => {
      const app = createPageApp(storage);
      const res = await request(app).get('/join/tok_fake?t=invalid.jwt.token');
      expect(res.status).toBe(403);
      expect(res.text).toContain('expired');
    });

    it('uses per-user invite URL from inviteCodes', async () => {
      const jti = 'tok_peruser';
      const signedToken = await signJoinToken(config, {
        sub: '@bob',
        groupId: 'grp_1',
        inviteId: 'inv_1',
        namespace: 'x-twitter',
        jti,
      });
      await storage.storeJoinToken(jti, {
        groupId: 'grp_1',
        inviteId: 'inv_1',
        namespace: 'x-twitter',
        pairingIdentifier: '@bob',
      });

      const app = createPageApp(storage);
      const res = await request(app).get(`/join/${jti}?t=${signedToken}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Scan to join group');
    });

    it('returns 500 error when inviteCodes is null', async () => {
      await storage.createGroup('grp_no_codes', {
        namespace: 'x-twitter',
        title: 'No Codes Group',
        pairingIdentifiers: ['@charlie', '@dave'],
        inviteCodes: null,
      });
      await storage.createInvite('inv_no_codes', {
        namespace: 'x-twitter',
        groupId: 'grp_no_codes',
      });

      const jti = 'tok_fallback';
      const signedToken = await signJoinToken(config, {
        sub: '@charlie',
        groupId: 'grp_no_codes',
        inviteId: 'inv_no_codes',
        namespace: 'x-twitter',
        jti,
      });
      await storage.storeJoinToken(jti, {
        groupId: 'grp_no_codes',
        inviteId: 'inv_no_codes',
        namespace: 'x-twitter',
        pairingIdentifier: '@charlie',
      });

      const app = createPageApp(storage);
      const res = await request(app).get(`/join/${jti}?t=${signedToken}`);
      expect(res.status).toBe(500);
      expect(res.text).toContain('Invite Unavailable');
    });

    it('returns 403 for consumed token', async () => {
      const jti = 'tok_consumed';
      const signedToken = await signJoinToken(config, {
        sub: '@alice',
        groupId: 'grp_1',
        inviteId: 'inv_1',
        namespace: 'x-twitter',
        jti,
      });
      await storage.storeJoinToken(jti, {
        groupId: 'grp_1',
        inviteId: 'inv_1',
        namespace: 'x-twitter',
        pairingIdentifier: '@alice',
      });
      await storage.consumeJoinToken(jti);

      const app = createPageApp(storage);
      const res = await request(app).get(`/join/${jti}?t=${signedToken}`);
      expect(res.status).toBe(403);
      expect(res.text).toContain('Already Used');
    });
  });
});
