import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { healthRoute } from '../../lib/routes/health.js';
import { readyRoute } from '../../lib/routes/ready.js';
import { metricsRoute } from '../../lib/routes/metrics.js';
import { createMetrics } from '../../lib/metrics/prometheus.js';

describe('observability endpoints', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const app = express();
      app.use(healthRoute());
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /ready', () => {
    it('returns 200 when storage healthy and agent connected', async () => {
      const storage = { isHealthy: async () => true };
      const agent = { isConnected: () => true };
      const app = express();
      app.use(readyRoute(storage, agent));

      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });

    it('returns 503 when storage unhealthy', async () => {
      const storage = { isHealthy: async () => false };
      const agent = { isConnected: () => true };
      const app = express();
      app.use(readyRoute(storage, agent));

      const res = await request(app).get('/ready');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not_ready');
      expect(res.body.storage).toBe('unhealthy');
    });

    it('returns 503 when agent disconnected', async () => {
      const storage = { isHealthy: async () => true };
      const agent = { isConnected: () => false };
      const app = express();
      app.use(readyRoute(storage, agent));

      const res = await request(app).get('/ready');
      expect(res.status).toBe(503);
      expect(res.body.agent).toBe('disconnected');
    });
  });

  describe('GET /metrics', () => {
    it('returns prometheus text format', async () => {
      const metrics = createMetrics();
      const app = express();
      app.use(metricsRoute(metrics));

      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.text).toContain('http_request_duration_seconds');
    });
  });
});
