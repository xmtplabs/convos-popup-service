import { Router } from 'express';
import { tokenRequestSchema } from '../schemas.js';
import { verifySecret } from '../auth/credentials.js';
import { signAccessToken } from '../auth/tokens.js';
import { LOCKOUT_MAX_FAILURES } from '../constants.js';

export function authRoutes(config, storage, metrics) {
  const router = Router();

  // POST /auth/token — exchange credentials for access token
  router.post('/auth/token', async (req, res, next) => {
    try {
      // Parse form-urlencoded or JSON body
      const body = req.body;
      const result = tokenRequestSchema.safeParse(body);
      if (!result.success) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing or invalid parameters. Required: grant_type, client_id, client_secret',
        });
      }

      const { client_id: clientId, client_secret: clientSecret } = result.data;

      // Check lockout
      const locked = await storage.isClientLocked(clientId);
      if (locked) {
        return res.status(423).json({
          error: 'client_locked',
          error_description: 'Account locked after repeated failed attempts. Rotate credentials to unlock.',
        });
      }

      // Get credentials
      const cred = await storage.getClientCredentials(clientId);
      if (!cred) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        });
      }

      // Check revoked
      const revoked = await storage.isClientRevoked(clientId);
      if (revoked) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Client credentials have been revoked',
        });
      }

      // Verify secret (check current hash, then grace period hash)
      let valid = await verifySecret(cred.secretHash, clientSecret);
      if (!valid && cred.previousSecretHash && cred.previousSecretGraceExpiresAt) {
        const graceExpiry = new Date(cred.previousSecretGraceExpiresAt);
        if (graceExpiry > new Date()) {
          valid = await verifySecret(cred.previousSecretHash, clientSecret);
        }
      }

      if (!valid) {
        const failCount = await storage.recordFailedAuth(clientId);
        if (failCount >= LOCKOUT_MAX_FAILURES) {
          await storage.lockClient(clientId);
          return res.status(423).json({
            error: 'client_locked',
            error_description: 'Account locked after repeated failed attempts. Rotate credentials to unlock.',
          });
        }
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        });
      }

      // Check namespace status
      const ns = await storage.getNamespaceByClientId(clientId);
      if (!ns) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        });
      }

      if (ns.status === 'pending_approval') {
        return res.status(403).json({
          error: 'namespace_pending_approval',
          error_description: 'Namespace registration is pending approval by the Convos team',
        });
      }

      if (ns.status === 'revoked') {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Client credentials have been revoked',
        });
      }

      // Reset failed auth on success
      await storage.resetFailedAuth(clientId);

      const scope = 'groups:write pairing:write verify:write';
      const accessToken = await signAccessToken(config, {
        clientId,
        namespace: ns.namespace,
        scope,
      });

      if (metrics) metrics.tokenExchanges.inc({ status: 'success', namespace: ns.namespace });

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
