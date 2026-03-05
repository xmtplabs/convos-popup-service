import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStorage } from '../../lib/storage/MemoryStorage.js';

function runStorageTests(createInstance) {
  let storage;

  beforeEach(async () => {
    storage = await createInstance();
  });

  afterEach(async () => {
    await storage.close();
  });

  describe('namespaces', () => {
    it('creates and retrieves a namespace', async () => {
      await storage.createNamespace({
        namespace: 'x-twitter',
        displayName: 'X/Twitter',
        verificationEndpoint: 'https://example.com/verify',
        contactEmail: 'ops@example.com',
        clientId: 'cps_live_abc',
      });
      const ns = await storage.getNamespace('x-twitter');
      expect(ns.namespace).toBe('x-twitter');
      expect(ns.status).toBe('pending_approval');
      expect(ns.displayName).toBe('X/Twitter');
    });

    it('throws on duplicate namespace', async () => {
      await storage.createNamespace({ namespace: 'test-ns', clientId: 'cps_1' });
      await expect(
        storage.createNamespace({ namespace: 'test-ns', clientId: 'cps_2' }),
      ).rejects.toThrow('DUPLICATE');
    });

    it('retrieves namespace by clientId', async () => {
      await storage.createNamespace({ namespace: 'discord', clientId: 'cps_live_xyz' });
      const ns = await storage.getNamespaceByClientId('cps_live_xyz');
      expect(ns.namespace).toBe('discord');
    });

    it('activates a namespace', async () => {
      await storage.createNamespace({ namespace: 'test-ns', clientId: 'cps_1' });
      await storage.activateNamespace('test-ns');
      const ns = await storage.getNamespace('test-ns');
      expect(ns.status).toBe('active');
    });

    it('revokes a namespace', async () => {
      await storage.createNamespace({ namespace: 'test-ns', clientId: 'cps_1' });
      await storage.revokeNamespace('test-ns');
      const ns = await storage.getNamespace('test-ns');
      expect(ns.status).toBe('revoked');
    });

    it('updates namespace fields', async () => {
      await storage.createNamespace({ namespace: 'test-ns', clientId: 'cps_1', displayName: 'Old' });
      await storage.updateNamespace('test-ns', { displayName: 'New' });
      const ns = await storage.getNamespace('test-ns');
      expect(ns.displayName).toBe('New');
    });

    it('returns null for non-existent namespace', async () => {
      expect(await storage.getNamespace('nope')).toBeNull();
    });
  });

  describe('client credentials', () => {
    it('stores and retrieves credentials', async () => {
      await storage.storeClientCredentials('cps_1', { secretHash: 'hash123' });
      const cred = await storage.getClientCredentials('cps_1');
      expect(cred.secretHash).toBe('hash123');
    });

    it('returns null for unknown clientId', async () => {
      expect(await storage.getClientCredentials('nope')).toBeNull();
    });

    it('tracks failed auth attempts', async () => {
      expect(await storage.getFailedAuthCount('cps_1')).toBe(0);
      await storage.recordFailedAuth('cps_1');
      await storage.recordFailedAuth('cps_1');
      expect(await storage.getFailedAuthCount('cps_1')).toBe(2);
      await storage.resetFailedAuth('cps_1');
      expect(await storage.getFailedAuthCount('cps_1')).toBe(0);
    });

    it('locks and checks client lockout', async () => {
      expect(await storage.isClientLocked('cps_1')).toBe(false);
      await storage.lockClient('cps_1');
      expect(await storage.isClientLocked('cps_1')).toBe(true);
    });
  });

  describe('groups', () => {
    it('creates and retrieves a group', async () => {
      await storage.createGroup('grp_1', { namespace: 'x-twitter', title: 'Test' });
      const group = await storage.getGroup('grp_1');
      expect(group.groupId).toBe('grp_1');
      expect(group.title).toBe('Test');
      expect(group.ready).toBe(false);
    });

    it('sets group ready', async () => {
      await storage.createGroup('grp_1', { namespace: 'x-twitter' });
      expect(await storage.isGroupReady('grp_1')).toBe(false);
      await storage.setGroupReady('grp_1');
      expect(await storage.isGroupReady('grp_1')).toBe(true);
    });

    it('returns null for unknown group', async () => {
      expect(await storage.getGroup('nope')).toBeNull();
    });
  });

  describe('invites', () => {
    it('creates and retrieves an invite', async () => {
      await storage.createInvite('inv_1', { namespace: 'x-twitter', groupId: 'grp_1' });
      const invite = await storage.getInvite('inv_1');
      expect(invite.status).toBe('pending');
      expect(invite.groupId).toBe('grp_1');
    });

    it('returns null for unknown invite', async () => {
      expect(await storage.getInvite('nope')).toBeNull();
    });
  });

  describe('pairing verifications', () => {
    it('marks and retrieves pairing verification', async () => {
      expect(await storage.getPairingVerification('grp_1', '@alice')).toBeNull();

      await storage.markPairingVerified('grp_1', '@alice', {
        joinTokenId: 'jti_1',
        redirectUrl: 'https://example.com/join/tok',
      });

      const record = await storage.getPairingVerification('grp_1', '@alice');
      expect(record.joinTokenId).toBe('jti_1');
      expect(record.redirectUrl).toBe('https://example.com/join/tok');
      expect(record.verifiedAt).toBeDefined();
    });

    it('tracks verifications per pairing identifier independently', async () => {
      await storage.markPairingVerified('grp_1', '@alice', { joinTokenId: 'jti_1', redirectUrl: '/a' });
      await storage.markPairingVerified('grp_1', '@bob', { joinTokenId: 'jti_2', redirectUrl: '/b' });

      const alice = await storage.getPairingVerification('grp_1', '@alice');
      const bob = await storage.getPairingVerification('grp_1', '@bob');
      expect(alice.joinTokenId).toBe('jti_1');
      expect(bob.joinTokenId).toBe('jti_2');
    });

    it('returns null for unverified pairing', async () => {
      expect(await storage.getPairingVerification('grp_1', '@charlie')).toBeNull();
    });
  });

  describe('join tokens', () => {
    it('stores and consumes join token (one-time)', async () => {
      await storage.storeJoinToken('jti_1', { groupId: 'grp_1' });
      const token = await storage.getJoinToken('jti_1');
      expect(token.consumed).toBe(false);

      expect(await storage.consumeJoinToken('jti_1')).toBe(true);
      expect(await storage.consumeJoinToken('jti_1')).toBe(false); // second consume fails
    });

    it('returns false for unknown token', async () => {
      expect(await storage.consumeJoinToken('nope')).toBe(false);
    });
  });

  describe('approval tokens', () => {
    it('stores and consumes approval token (single-use)', async () => {
      await storage.storeApprovalToken('tok_1', { namespace: 'x-twitter' });
      const token = await storage.getApprovalToken('tok_1');
      expect(token.consumed).toBe(false);

      expect(await storage.consumeApprovalToken('tok_1')).toBe(true);
      expect(await storage.consumeApprovalToken('tok_1')).toBe(false);
    });
  });

  describe('health check cache', () => {
    it('stores and retrieves health check results', async () => {
      expect(await storage.getHealthCheckResult('x-twitter')).toBeNull();
      await storage.setHealthCheckResult('x-twitter', true);
      expect(await storage.getHealthCheckResult('x-twitter')).toBe(true);
      await storage.setHealthCheckResult('x-twitter', false);
      expect(await storage.getHealthCheckResult('x-twitter')).toBe(false);
    });
  });

  describe('client revocation', () => {
    it('marks and checks revocation', async () => {
      expect(await storage.isClientRevoked('cps_1')).toBe(false);
      await storage.markClientRevoked('cps_1', new Date().toISOString());
      expect(await storage.isClientRevoked('cps_1')).toBe(true);
    });
  });

  describe('XMTP group lookups and member joins', () => {
    it('looks up group by XMTP ID', async () => {
      await storage.createGroup('grp_1', { namespace: 'x-twitter', xmtpGroupId: 'xmtp_abc' });
      const group = await storage.getGroupByXmtpId('xmtp_abc');
      expect(group).not.toBeNull();
      expect(group.groupId).toBe('grp_1');
    });

    it('returns null for unknown XMTP ID', async () => {
      expect(await storage.getGroupByXmtpId('xmtp_unknown')).toBeNull();
    });

    it('records and counts member joins', async () => {
      expect(await storage.getJoinCount('xmtp_abc')).toBe(0);
      await storage.recordMemberJoin('xmtp_abc', 'inbox_1');
      expect(await storage.getJoinCount('xmtp_abc')).toBe(1);
      await storage.recordMemberJoin('xmtp_abc', 'inbox_2');
      expect(await storage.getJoinCount('xmtp_abc')).toBe(2);
    });

    it('deduplicates same inbox ID', async () => {
      await storage.recordMemberJoin('xmtp_abc', 'inbox_1');
      await storage.recordMemberJoin('xmtp_abc', 'inbox_1');
      expect(await storage.getJoinCount('xmtp_abc')).toBe(1);
    });

    it('tracks joins per group independently', async () => {
      await storage.recordMemberJoin('xmtp_aaa', 'inbox_1');
      await storage.recordMemberJoin('xmtp_bbb', 'inbox_2');
      await storage.recordMemberJoin('xmtp_bbb', 'inbox_3');
      expect(await storage.getJoinCount('xmtp_aaa')).toBe(1);
      expect(await storage.getJoinCount('xmtp_bbb')).toBe(2);
    });
  });

  describe('app icons', () => {
    it('stores and retrieves an icon', async () => {
      const data = Buffer.from('fake-png-data');
      await storage.storeAppIcon('x-twitter', { contentType: 'image/png', data });
      const icon = await storage.getAppIcon('x-twitter');
      expect(icon).not.toBeNull();
      expect(icon.contentType).toBe('image/png');
      expect(Buffer.isBuffer(icon.data)).toBe(true);
      expect(icon.data.toString()).toBe('fake-png-data');
    });

    it('returns null for unknown namespace', async () => {
      expect(await storage.getAppIcon('no-such-ns')).toBeNull();
    });
  });

  describe('lifecycle', () => {
    it('reports healthy', async () => {
      expect(await storage.isHealthy()).toBe(true);
    });
  });
}

describe('MemoryStorage', () => {
  runStorageTests(() => new MemoryStorage());
});
