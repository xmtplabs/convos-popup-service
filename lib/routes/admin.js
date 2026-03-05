import { Router } from 'express';
import { revokeClientSchema } from '../schemas.js';

export function adminRoutes(config, storage, logger) {
  const router = Router();

  // Admin auth middleware
  router.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${config.adminToken}`) {
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Invalid admin credentials',
      });
    }
    next();
  });

  // POST /revoke-client — hard kill (mounted at /admin)
  router.post('/revoke-client', async (req, res, next) => {
    try {
      const result = revokeClientSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'validation_error',
          details: result.error.issues,
        });
      }

      const { clientId, reason } = result.data;

      // Find namespace for this client
      const ns = await storage.getNamespaceByClientId(clientId);
      if (!ns) {
        return res.status(404).json({
          error: 'client_not_found',
          error_description: 'No client found with this ID',
        });
      }

      const revokedAt = new Date().toISOString();

      // Hard kill: revoke client, revoke namespace, invalidate invites
      await storage.markClientRevoked(clientId, revokedAt);
      await storage.revokeNamespace(ns.namespace);
      await storage.invalidateNamespaceInvites(ns.namespace);

      if (logger) {
        logger.info(
          { event: 'credential_revocation', clientId, namespace: ns.namespace, reason, revokedAt },
          `Client ${clientId} revoked`,
        );
      }

      res.json({
        clientId,
        namespace: ns.namespace,
        status: 'revoked',
        revokedAt,
        reason,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
