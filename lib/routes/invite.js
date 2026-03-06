import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function inviteRoutes(config, storage) {
  const router = Router();

  // GET /invite/:namespace/:inviteId — landing page
  router.get('/invite/:namespace/:inviteId', async (req, res, next) => {
    try {
      const invite = await storage.getInvite(req.params.inviteId);
      if (!invite) {
        return res.status(404).render('error', {
          title: 'Invite Not Found',
          message: 'This invite link is invalid or has expired.',
        });
      }

      // Look up group for title
      const group = await storage.getGroup(invite.groupId);

      // Look up namespace for display info
      const ns = await storage.getNamespace(invite.namespace);
      if (!ns) {
        return res.status(404).render('error', {
          title: 'Error',
          message: 'The service associated with this invite is no longer available.',
        });
      }

      // Check health of verification endpoint
      let healthy = true;
      const healthResult = await storage.getHealthCheckResult(invite.namespace);
      if (healthResult !== null) {
        healthy = healthResult;
      }

      // Build verify URL
      const verifyUrl = `${ns.verificationEndpoint}?invite_id=${invite.inviteId}&callback=${encodeURIComponent(config.baseUrl + '/auth/complete')}&namespace=${invite.namespace}`;

      // Extract domain from verification endpoint
      let verificationDomain = '';
      try {
        verificationDomain = new URL(ns.verificationEndpoint).hostname;
      } catch {
        verificationDomain = ns.verificationEndpoint;
      }

      res.render('landing', {
        groupTitle: group ? group.title : 'Unknown Group',
        displayName: ns.displayName || ns.namespace,
        namespace: ns.namespace,
        verificationDomain,
        verifyUrl,
        healthy,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
