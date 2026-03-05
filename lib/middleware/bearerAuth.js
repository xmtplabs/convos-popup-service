import { verifyAccessToken } from '../auth/tokens.js';

export function createBearerAuth(config, storage) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Missing or malformed Authorization header',
      });
    }

    const token = authHeader.slice(7);
    try {
      const payload = await verifyAccessToken(config, token);

      // Check if client has been revoked
      const revoked = await storage.isClientRevoked(payload.sub);
      if (revoked) {
        return res.status(401).json({
          error: 'invalid_token',
          error_description: 'Client credentials have been revoked',
        });
      }

      req.auth = {
        clientId: payload.sub,
        namespace: payload.namespace,
        scope: payload.scope,
      };
      next();
    } catch {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Token expired or invalid',
      });
    }
  };
}
