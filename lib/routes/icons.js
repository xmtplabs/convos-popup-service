import { Router } from 'express';

export function iconRoutes(storage) {
  const router = Router();

  router.get('/icons/:namespace', async (req, res, next) => {
    try {
      const icon = await storage.getAppIcon(req.params.namespace);
      if (!icon) {
        return res.status(404).json({ error: 'icon_not_found' });
      }

      res.set('Content-Type', icon.contentType);
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(icon.data);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
