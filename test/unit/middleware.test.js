import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestConfig } from '../helpers/setup.js';
import { MemoryStorage } from '../../lib/storage/memory-storage.js';
import { signAccessToken } from '../../lib/auth/tokens.js';
import { createBearerAuth } from '../../lib/middleware/bearerAuth.js';
import { namespaceEnforcement } from '../../lib/middleware/namespaceEnforcement.js';
import { errorHandler } from '../../lib/middleware/errorHandler.js';

const config = createTestConfig();

describe('bearerAuth middleware', () => {
  let app, storage;

  beforeEach(() => {
    storage = new MemoryStorage();
    const auth = createBearerAuth(config, storage);
    app = express();
    app.get('/test', auth, (req, res) => {
      res.json({ auth: req.auth });
    });
  });

  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_token');
  });

  it('returns 401 with malformed header', async () => {
    const res = await request(app).get('/test').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app).get('/test').set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('sets req.auth on valid token', async () => {
    const token = await signAccessToken(config, {
      clientId: 'cps_live_abc',
      namespace: 'x-twitter',
      scope: 'groups:write',
    });
    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.auth.clientId).toBe('cps_live_abc');
    expect(res.body.auth.namespace).toBe('x-twitter');
  });

  it('returns 401 if client is revoked', async () => {
    await storage.markClientRevoked('cps_live_abc', new Date().toISOString());
    const token = await signAccessToken(config, {
      clientId: 'cps_live_abc',
      namespace: 'x-twitter',
      scope: 'groups:write',
    });
    const res = await request(app).get('/test').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('namespaceEnforcement middleware', () => {
  it('passes when namespace matches', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.auth = { namespace: 'x-twitter' };
      next();
    });
    app.get('/api/v1/namespaces/:namespace/test', namespaceEnforcement(), (req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/api/v1/namespaces/x-twitter/test');
    expect(res.status).toBe(200);
  });
});

describe('errorHandler middleware', () => {
  it('returns JSON error without stack in production', async () => {
    const prodConfig = createTestConfig({ NODE_ENV: 'production' });
    const app = express();
    app.get('/fail', () => {
      const err = new Error('Something broke');
      err.status = 422;
      err.code = 'validation_error';
      throw err;
    });
    app.use(errorHandler(prodConfig));

    const res = await request(app).get('/fail');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.stack).toBeUndefined();
  });
});
