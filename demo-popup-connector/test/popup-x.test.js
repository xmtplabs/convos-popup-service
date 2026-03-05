import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createTestApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.resolve(__dirname, '../views'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', registered: false });
  });

  app.get('/verify', (req, res) => {
    const { invite_id, callback, namespace } = req.query;
    res.render('verify', {
      invite_id: invite_id || '',
      callback: callback || '',
      namespace: namespace || 'test-x',
    });
  });

  return app;
}

describe('demo-popup-connector', () => {
  it('GET /health returns ok', async () => {
    const app = createTestApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /verify renders form', async () => {
    const app = createTestApp();
    const res = await request(app).get('/verify?invite_id=inv_123&callback=http://localhost:3000/auth/complete&namespace=test-x');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Verify Your Identity');
    expect(res.text).toContain('inv_123');
  });
});
