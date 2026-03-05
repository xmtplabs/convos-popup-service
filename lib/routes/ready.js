import { Router } from 'express';

export function readyRoute(storage, agent) {
  const router = Router();
  router.get('/ready', async (_req, res) => {
    const storageHealthy = await storage.isHealthy();
    const agentConnected = agent ? agent.isConnected() : true;

    if (storageHealthy && agentConnected) {
      return res.json({ status: 'ready' });
    }

    res.status(503).json({
      status: 'not_ready',
      storage: storageHealthy ? 'ok' : 'unhealthy',
      agent: agentConnected ? 'ok' : 'disconnected',
    });
  });
  return router;
}
