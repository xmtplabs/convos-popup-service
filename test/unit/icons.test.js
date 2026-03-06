import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MemoryStorage } from '../../lib/storage/memory-storage.js';
import { iconRoutes } from '../../lib/routes/icons.js';

describe('icon routes', () => {
  let storage, app;

  beforeEach(async () => {
    storage = new MemoryStorage();
    app = express();
    app.use(iconRoutes(storage));
  });

  it('serves stored icon with correct content-type', async () => {
    const data = Buffer.from('fake-png-bytes');
    await storage.storeAppIcon('x-twitter', { contentType: 'image/png', data });

    const res = await request(app).get('/icons/x-twitter');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toContain('public');
    expect(Buffer.from(res.body).toString()).toBe('fake-png-bytes');
  });

  it('returns 404 for unknown namespace', async () => {
    const res = await request(app).get('/icons/no-such-ns');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('icon_not_found');
  });
});
