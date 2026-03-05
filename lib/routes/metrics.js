import { Router } from 'express';

export function metricsRoute(metricsObj) {
  const router = Router();
  router.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metricsObj.registry.contentType);
    res.end(await metricsObj.registry.metrics());
  });
  return router;
}
