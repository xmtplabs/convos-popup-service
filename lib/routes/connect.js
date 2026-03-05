import { Router } from 'express';
import { createRegisterNamespaceSchema, createUpdateNamespaceSchema } from '../schemas.js';
import { generateClientId, generateClientSecret, generateApprovalToken, hashSecret } from '../auth/credentials.js';
import { signApprovalToken } from '../auth/tokens.js';
import { TTL } from '../constants.js';
import { fetchIcon } from '../utils/fetchIcon.js';

export function connectRoutes(config, storage, notifier) {
  const router = Router();
  const requireHttps = config.nodeEnv === 'production';
  const registerNamespaceSchema = createRegisterNamespaceSchema({ requireHttps });
  const updateNamespaceSchema = createUpdateNamespaceSchema({ requireHttps });

  // POST /connect/register — register a namespace (public, rate-limited)
  router.post('/connect/register', async (req, res, next) => {
    try {
      const result = registerNamespaceSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'validation_error',
          details: result.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        });
      }

      const { namespace, displayName, verificationEndpoint, appIconUrl, contactEmail } = result.data;

      // Fetch and validate icon
      let iconData;
      try {
        iconData = await fetchIcon(appIconUrl);
      } catch (err) {
        return res.status(400).json({
          error: 'icon_fetch_failed',
          error_description: err.message,
        });
      }

      // Check for duplicate
      const existing = await storage.getNamespace(namespace);
      if (existing) {
        return res.status(409).json({
          error: 'namespace_exists',
          error_description: `Namespace '${namespace}' is already registered`,
        });
      }

      const clientId = generateClientId();
      const clientSecret = generateClientSecret();
      const secretHash = await hashSecret(clientSecret);
      const approvalToken = generateApprovalToken();

      // Sign the approval token as a JWT
      const signedApproval = await signApprovalToken(config, { namespace, token: approvalToken });

      // Store namespace
      await storage.createNamespace({
        namespace,
        displayName,
        verificationEndpoint,
        appIconUrl,
        contactEmail,
        clientId,
      });

      // Store icon bytes
      await storage.storeAppIcon(namespace, iconData);

      // Store credentials
      await storage.storeClientCredentials(clientId, { secretHash, namespace });

      // Store approval token
      await storage.storeApprovalToken(approvalToken, {
        namespace,
        ttlMs: TTL.APPROVAL_TOKEN_SECONDS * 1000,
        ttlSeconds: TTL.APPROVAL_TOKEN_SECONDS,
      });

      const approvalUrl = `${config.baseUrl}/connect/approve/${signedApproval}`;

      // Notify
      if (notifier) {
        await notifier.notifyApproval({
          namespace,
          displayName,
          verificationEndpoint,
          contactEmail,
          approvalUrl,
        });
      }

      res.status(202).json({
        clientId,
        clientSecret,
        namespace,
        status: 'pending_approval',
        tokenEndpoint: `${config.baseUrl}/auth/token`,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /connect/approve/:approvalToken — approve a namespace (secret URL)
  router.get('/connect/approve/:approvalToken', async (req, res, next) => {
    try {
      const { verifyApprovalToken } = await import('../auth/tokens.js');
      const signedToken = req.params.approvalToken;

      let payload;
      try {
        payload = await verifyApprovalToken(config, signedToken);
      } catch {
        return res.status(400).send('Invalid or expired approval link.');
      }

      const rawToken = payload.tok;
      const consumed = await storage.consumeApprovalToken(rawToken);
      if (!consumed) {
        return res.status(400).send('Approval link has already been used or has expired.');
      }

      await storage.activateNamespace(payload.namespace);

      // Render a simple HTML confirmation
      res.type('html').send(
        `<!DOCTYPE html><html><body><h1>Namespace Approved</h1><p>Namespace '${payload.namespace}' approved. Credentials are now active.</p></body></html>`,
      );
    } catch (err) {
      next(err);
    }
  });

  // POST /connect/rotate-secret — rotate client secret (authenticated)
  router.post('/connect/rotate-secret', async (req, res, next) => {
    try {
      const { clientId } = req.auth;
      const cred = await storage.getClientCredentials(clientId);
      if (!cred) {
        return res.status(404).json({ error: 'client_not_found' });
      }

      const newSecret = generateClientSecret();
      const newHash = await hashSecret(newSecret);
      const graceExpiresAt = new Date(Date.now() + TTL.SECRET_GRACE_PERIOD_SECONDS * 1000).toISOString();

      await storage.updateClientSecretHash(clientId, newHash, cred.secretHash, graceExpiresAt);

      // Unlock if locked (rotation clears lockout)
      await storage.resetFailedAuth(clientId);

      res.json({
        clientId,
        clientSecret: newSecret,
        previousSecretExpiresAt: graceExpiresAt,
      });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /connect/namespace — update registration details (authenticated)
  router.patch('/connect/namespace', async (req, res, next) => {
    try {
      const result = updateNamespaceSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'validation_error',
          details: result.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        });
      }

      const { namespace } = req.auth;

      // If appIconUrl changed, fetch and store the new icon
      if (result.data.appIconUrl) {
        let iconData;
        try {
          iconData = await fetchIcon(result.data.appIconUrl);
        } catch (err) {
          return res.status(400).json({
            error: 'icon_fetch_failed',
            error_description: err.message,
          });
        }
        await storage.storeAppIcon(namespace, iconData);
      }

      const updated = await storage.updateNamespace(namespace, result.data);
      if (!updated) {
        return res.status(404).json({ error: 'namespace_not_found' });
      }

      res.json({
        namespace: updated.namespace,
        displayName: updated.displayName,
        verificationEndpoint: updated.verificationEndpoint,
        contactEmail: updated.contactEmail,
        updatedAt: updated.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
