import { Router } from 'express';
import { verifyUserSchema } from '../schemas.js';
import { generateJoinTokenId } from '../auth/credentials.js';
import { signJoinToken } from '../auth/tokens.js';
import { TTL } from '../constants.js';

export function verifyRoutes(config, storage, metrics) {
  const router = Router();

  // POST /api/v1/namespaces/:namespace/verify — vouch for a user
  router.post('/', async (req, res, next) => {
    try {
      const result = verifyUserSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'validation_error',
          details: result.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        });
      }

      const { pairingIdentifier, inviteId } = result.data;
      const namespace = req.auth.namespace;

      // Look up invite
      const invite = await storage.getInvite(inviteId);
      if (!invite || invite.namespace !== namespace) {
        return res.status(404).json({
          error: 'invite_not_found',
          error_description: 'No pending invite found for this pairing identifier',
        });
      }

      // Look up group and check pairing identifier membership
      const group = await storage.getGroup(invite.groupId);
      if (!group || !group.pairingIdentifiers.includes(pairingIdentifier)) {
        return res.status(404).json({
          error: 'invite_not_found',
          error_description: 'No pending invite found for this pairing identifier',
        });
      }

      // Check if this pairing ID already verified
      const existing = await storage.getPairingVerification(invite.groupId, pairingIdentifier);
      if (existing) {
        return res.status(409).json({
          error: 'already_verified',
          error_description: 'This pairing identifier has already been verified',
          redirectUrl: existing.redirectUrl,
        });
      }

      // Generate join token
      const jti = generateJoinTokenId();
      const joinJwt = await signJoinToken(config, {
        sub: pairingIdentifier,
        groupId: invite.groupId,
        inviteId,
        namespace,
        jti,
      });

      const redirectUrl = `${config.baseUrl}/join/${jti}?t=${joinJwt}`;

      // Store join token
      await storage.storeJoinToken(jti, {
        groupId: invite.groupId,
        inviteId,
        namespace,
        pairingIdentifier,
        ttlMs: TTL.JOIN_TOKEN_SECONDS * 1000,
        ttlSeconds: TTL.JOIN_TOKEN_SECONDS,
      });

      // Record pairing verification
      await storage.markPairingVerified(invite.groupId, pairingIdentifier, {
        joinTokenId: jti,
        redirectUrl,
      });

      if (metrics) metrics.verifications.inc();

      res.json({
        status: 'verified',
        redirectUrl,
        expiresAt: new Date(Date.now() + TTL.JOIN_TOKEN_SECONDS * 1000).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
