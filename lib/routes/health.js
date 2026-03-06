import { Router } from 'express';

export function healthRoute() {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'popup' });
  });
  return router;
}
