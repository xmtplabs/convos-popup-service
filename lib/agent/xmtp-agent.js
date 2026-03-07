import { mkdirSync } from 'node:fs';
import { Agent, createUser, createSigner } from '@xmtp/agent-sdk';
import { ConvosMiddleware } from 'convos-node-sdk';
import { AgentInterface } from './agent-interface.js';

export class XmtpAgent extends AgentInterface {
  constructor(config, storage, logger, metrics) {
    super();
    this.config = config;
    this.storage = storage;
    this.logger = logger;
    this.metrics = metrics || null;
    this._agent = null;
    this._convos = null;
    this._connected = false;
  }

  async init() {
    const end = this.metrics
      ? this.metrics.agentInitDuration.startTimer()
      : null;
    try {
      const hasKey = !!this.config.xmtpAgentKey;
      this.logger.info({ hasKey }, 'Creating XMTP user identity');
      const user = hasKey
        ? createUser(this.config.xmtpAgentKey.startsWith('0x') ? this.config.xmtpAgentKey : `0x${this.config.xmtpAgentKey}`)
        : createUser();
      const signer = createSigner(user);

      const dbDir = this.config.xmtpDbDirectory || '.convos-agent';
      mkdirSync(dbDir, { recursive: true });

      const env = this.config.xmtpEnv || 'dev';
      this.logger.info({ env, dbDir }, 'Creating XMTP agent client');

      this._agent = await Agent.create(signer, {
        env,
        dbPath: `${dbDir}/xmtp.db`,
        dbEncryptionKey: this.config.xmtpDbEncryptionKey
          ? (this.config.xmtpDbEncryptionKey.startsWith('0x') ? this.config.xmtpDbEncryptionKey : `0x${this.config.xmtpDbEncryptionKey}`)
          : undefined,
      });

      this.logger.info('XMTP agent client created, initializing Convos middleware');

      this._convos = ConvosMiddleware.create(this._agent, {
        privateKey: user.key,
      });

      this._agent.use(this._convos.middleware());

      this._convos.on('invite', async (ctx) => {
        const desc = ctx.invite?.payload?.description || '';
        const match = desc.match(/^pairing:(pc_[0-9a-f]+)$/);
        const pairingCode = match ? match[1] : null;

        this.logger.info(
          { joinerInboxId: ctx.joinerInboxId, conversationId: ctx.conversationId, pairingCode },
          'Invite received, accepting',
        );
        await ctx.accept();
        this.logger.info(
          { joinerInboxId: ctx.joinerInboxId, conversationId: ctx.conversationId },
          'Invite accepted',
        );

        await this._onMemberJoined(
          ctx.conversationId,
          ctx.joinerInboxId,
          pairingCode,
        );
      });

      this.logger.info('Starting XMTP agent stream');
      await this._agent.start();
      this._connected = true;
      if (this.metrics) {
        end({ status: 'success' });
        this.metrics.agentConnected.set(1);
      }
      this.logger.info('XMTP agent started and streaming');
    } catch (err) {
      if (end) end({ status: 'error' });
      throw err;
    }
  }

  async createGroup(title, description, pairingCodes) {
    const end = this.metrics
      ? this.metrics.agentCreateGroupDuration.startTimer()
      : null;
    try {
      this.logger.info({ title, pairingCount: pairingCodes ? Object.keys(pairingCodes).length : 0 }, 'Creating XMTP group');

      const xmtpGroup = await this._agent.client.conversations.createGroup([], {
        groupName: title,
        groupDescription: description,
      });

      this.logger.info({ xmtpGroupId: xmtpGroup.id, title }, 'XMTP group created');

      const wrapped = this._convos.group(xmtpGroup);
      const inviteCodes = {};

      if (pairingCodes) {
        for (const [pairingId, code] of Object.entries(pairingCodes)) {
          this.logger.info({ xmtpGroupId: xmtpGroup.id, pairingId }, 'Creating invite for pairing ID');

          const invite = await wrapped.createInvite({
            name: title,
            description: `pairing:${code}`,
            expiresAfterUse: true,
          });
          inviteCodes[pairingId] = { code, joinUrl: invite.url };

          if (this.metrics) this.metrics.agentInvitesCreated.inc();
          this.logger.info({ xmtpGroupId: xmtpGroup.id, pairingId, joinUrl: invite.url }, 'Invite created');
        }
      }

      if (end) end({ status: 'success' });
      this.logger.info({ xmtpGroupId: xmtpGroup.id, inviteCount: Object.keys(inviteCodes).length }, 'All invites created for group');
      return { groupId: xmtpGroup.id, inviteCodes };
    } catch (err) {
      if (end) end({ status: 'error' });
      throw err;
    }
  }

  async promoteAllMembers(groupId) {
    const end = this.metrics
      ? this.metrics.agentPromoteMembersDuration.startTimer()
      : null;
    try {
      this.logger.info({ xmtpGroupId: groupId }, 'Promoting all members to super admin');

      const group =
        await this._agent.client.conversations.getConversationById(groupId);
      if (!group) {
        this.logger.warn({ xmtpGroupId: groupId }, 'Group not found for promotion');
        if (end) end({ status: 'success' });
        return;
      }

      const members = await group.members();
      const agentInboxId = this._agent.client.inboxId;
      this.logger.info({ xmtpGroupId: groupId, memberCount: members.length }, 'Fetched group members');

      for (const member of members) {
        if (member.inboxId === agentInboxId) continue;
        if (!group.isSuperAdmin(member.inboxId)) {
          this.logger.info({ xmtpGroupId: groupId, inboxId: member.inboxId }, 'Promoting member to super admin');
          await group.addSuperAdmin(member.inboxId);
          this.logger.info({ xmtpGroupId: groupId, inboxId: member.inboxId }, 'Member promoted');
        }
      }

      if (end) end({ status: 'success' });
      this.logger.info({ xmtpGroupId: groupId }, 'All members promoted');
    } catch (err) {
      if (end) end({ status: 'error' });
      throw err;
    }
  }

  async leaveGroup(groupId) {
    const end = this.metrics
      ? this.metrics.agentLeaveGroupDuration.startTimer()
      : null;
    try {
      this.logger.info({ xmtpGroupId: groupId }, 'Preparing to leave group');

      const group =
        await this._agent.client.conversations.getConversationById(groupId);
      if (!group) {
        this.logger.warn({ xmtpGroupId: groupId }, 'Group not found for leave');
        if (end) end({ status: 'success' });
        return;
      }

      const agentInboxId = this._agent.client.inboxId;
      if (group.isSuperAdmin(agentInboxId)) {
        this.logger.info({ xmtpGroupId: groupId }, 'Demoting agent from super admin');
        await group.removeSuperAdmin(agentInboxId);
        this.logger.info({ xmtpGroupId: groupId }, 'Agent demoted from super admin');
      }

      this.logger.info({ xmtpGroupId: groupId }, 'Requesting removal from group');
      await group.requestRemoval();
      if (end) end({ status: 'success' });
      this.logger.info({ xmtpGroupId: groupId }, 'Agent left group');
    } catch (err) {
      if (end) end({ status: 'error' });
      throw err;
    }
  }

  isConnected() {
    return this._connected;
  }

  async close() {
    this.logger.info('Stopping XMTP agent');
    if (this._agent) await this._agent.stop();
    this._connected = false;
    if (this.metrics) this.metrics.agentConnected.set(0);
    this.logger.info('XMTP agent stopped');
  }

  async _onMemberJoined(xmtpGroupId, joinerInboxId, pairingCode) {
    try {
      if (this.metrics) this.metrics.agentMemberJoins.inc();

      this.logger.info({ xmtpGroupId, joinerInboxId, pairingCode }, 'Recording member join');
      await this.storage.recordMemberJoin(xmtpGroupId, joinerInboxId);

      const group = await this.storage.getGroupByXmtpId(xmtpGroupId);
      if (!group) {
        this.logger.warn({ xmtpGroupId }, 'No popup-service group found for XMTP group');
        return;
      }

      const joinCount = await this.storage.getJoinCount(xmtpGroupId);
      const expectedCount = group.pairingIdentifiers
        ? group.pairingIdentifiers.length
        : 0;

      this.logger.info(
        { xmtpGroupId, groupId: group.groupId, joinCount, expectedCount, pairingCode },
        'Member join recorded',
      );

      const elapsedSeconds = group.createdAt
        ? (Date.now() - new Date(group.createdAt).getTime()) / 1000
        : null;

      if (this.metrics && joinCount === 1 && elapsedSeconds !== null) {
        this.metrics.groupTimeToFirstJoin.observe(elapsedSeconds);
        this.metrics.groupLifecycleTransitions.inc({ transition: 'first_join' });
      }

      if (expectedCount > 0 && joinCount >= expectedCount) {
        if (this.metrics && elapsedSeconds !== null) {
          this.metrics.groupTimeToAllJoined.observe(elapsedSeconds);
          this.metrics.groupLifecycleTransitions.inc({ transition: 'all_joined' });
        }

        this.logger.info({ xmtpGroupId, groupId: group.groupId }, 'All members joined — promoting and leaving');
        await this.promoteAllMembers(xmtpGroupId);
        if (this.metrics) this.metrics.groupLifecycleTransitions.inc({ transition: 'promoted' });

        // TODO: skipping the leave for now
        // await this.leaveGroup(xmtpGroupId);
        await this.storage.setGroupReady(group.groupId);

        if (this.metrics) {
          this.metrics.agentGroupsReady.inc();
          this.metrics.activeGroups.dec();
          this.metrics.groupLifecycleTransitions.inc({ transition: 'ready' });
          if (elapsedSeconds !== null) {
            const readyElapsed = group.createdAt
              ? (Date.now() - new Date(group.createdAt).getTime()) / 1000
              : elapsedSeconds;
            this.metrics.groupTimeToReady.observe(readyElapsed);
          }
        }

        this.logger.info({ xmtpGroupId, groupId: group.groupId }, 'Group ready — agent has left');
      } else {
        this.logger.info(
          { xmtpGroupId, groupId: group.groupId, joinCount, expectedCount },
          'Waiting for more members to join',
        );
      }
    } catch (err) {
      if (this.metrics) this.metrics.agentMemberJoinErrors.inc();
      this.logger.error({ err, xmtpGroupId, joinerInboxId }, 'Error in _onMemberJoined');
    }
  }
}
