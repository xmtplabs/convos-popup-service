import { Router } from 'express';
import { createGroupSchema } from '../schemas.js';
import { generateGroupId, generateInviteId, generatePairingCode } from '../auth/credentials.js';
import { TTL } from '../constants.js';

export function groupRoutes(config, storage, agent, metrics) {
  const router = Router();

  // POST /api/v1/namespaces/:namespace/groups — create a group
  router.post('/', async (req, res, next) => {
    try {
      const result = createGroupSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'validation_error',
          details: result.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        });
      }

      const { title, description, pairingIdentifiers } = result.data;
      const namespace = req.auth.namespace;

      // Create group via agent
      const groupId = generateGroupId();
      const pairingCodes = {};
      for (const id of pairingIdentifiers) {
        pairingCodes[id] = generatePairingCode();
      }

      if (!agent || !agent.isConnected()) {
        return res.status(503).json({
          error: 'agent_unavailable',
          error_description: 'Messaging agent is not available. Group creation requires an active agent.',
        });
      }

      const agentGroupData = await agent.createGroup(title, description, pairingCodes);

      await storage.createGroup(groupId, {
        namespace,
        title,
        description,
        pairingIdentifiers,
        xmtpGroupId: agentGroupData.groupId || null,
        inviteCodes: agentGroupData.inviteCodes || null,
      });

      // Create a single invite for the group
      const inviteId = generateInviteId();
      await storage.createInvite(inviteId, {
        namespace,
        groupId,
        ttlMs: TTL.INVITE_SECONDS * 1000,
        ttlSeconds: TTL.INVITE_SECONDS,
      });

      if (metrics) {
        metrics.groupsCreated.inc({ namespace });
        metrics.activeGroups.inc();
        metrics.groupMemberCount.observe(pairingIdentifiers.length);
        metrics.groupLifecycleTransitions.inc({ transition: 'created' });
      }

      res.status(201).json({
        groupId,
        namespace,
        inviteId,
        inviteUrl: `${config.baseUrl}/invite/${namespace}/${inviteId}`,
        pairingIdentifiers,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/namespaces/:namespace/groups/:groupId — minimal group info
  router.get('/:groupId', async (req, res, next) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group || group.namespace !== req.auth.namespace) {
        return res.status(404).json({
          error: 'group_not_found',
          error_description: `No group found with this ID in namespace '${req.auth.namespace}'`,
        });
      }
      res.json({
        groupId: group.groupId,
        namespace: group.namespace,
        exists: true,
        createdAt: group.createdAt,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/namespaces/:namespace/groups/:groupId/ready — readiness poll
  router.get('/:groupId/ready', async (req, res, next) => {
    try {
      const group = await storage.getGroup(req.params.groupId);
      if (!group || group.namespace !== req.auth.namespace) {
        return res.status(404).json({
          error: 'group_not_found',
          error_description: `No group found with this ID in namespace '${req.auth.namespace}'`,
        });
      }
      res.json({
        groupId: group.groupId,
        ready: group.ready,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
