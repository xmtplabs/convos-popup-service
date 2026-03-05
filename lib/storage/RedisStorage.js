import { StorageInterface } from './StorageInterface.js';

const PREFIX = 'popup';

function key(...parts) {
  return `${PREFIX}:${parts.join(':')}`;
}

export class RedisStorage extends StorageInterface {
  constructor(redis) {
    super();
    this.redis = redis;
  }

  // Namespace CRUD
  async createNamespace(data) {
    const k = key('ns', data.namespace);
    const existing = await this.redis.get(k);
    if (existing) throw new Error('DUPLICATE');
    const record = { ...data, status: 'pending_approval', createdAt: new Date().toISOString() };
    await this.redis.set(k, JSON.stringify(record));
    // Index by clientId
    await this.redis.set(key('ns-by-client', data.clientId), data.namespace);
  }

  async getNamespace(namespace) {
    const raw = await this.redis.get(key('ns', namespace));
    return raw ? JSON.parse(raw) : null;
  }

  async getNamespaceByClientId(clientId) {
    const namespace = await this.redis.get(key('ns-by-client', clientId));
    if (!namespace) return null;
    return this.getNamespace(namespace);
  }

  async updateNamespace(namespace, updates) {
    const ns = await this.getNamespace(namespace);
    if (!ns) return null;
    Object.assign(ns, updates, { updatedAt: new Date().toISOString() });
    await this.redis.set(key('ns', namespace), JSON.stringify(ns));
    return ns;
  }

  async activateNamespace(namespace) {
    const ns = await this.getNamespace(namespace);
    if (!ns) return null;
    ns.status = 'active';
    ns.activatedAt = new Date().toISOString();
    await this.redis.set(key('ns', namespace), JSON.stringify(ns));
    return ns;
  }

  async revokeNamespace(namespace) {
    const ns = await this.getNamespace(namespace);
    if (!ns) return null;
    ns.status = 'revoked';
    ns.revokedAt = new Date().toISOString();
    await this.redis.set(key('ns', namespace), JSON.stringify(ns));
    return ns;
  }

  // Client credentials
  async storeClientCredentials(clientId, data) {
    await this.redis.set(key('client', clientId), JSON.stringify(data));
  }

  async getClientCredentials(clientId) {
    const raw = await this.redis.get(key('client', clientId));
    return raw ? JSON.parse(raw) : null;
  }

  async updateClientSecretHash(clientId, newHash, previousHash, graceExpiresAt) {
    const cred = await this.getClientCredentials(clientId);
    if (!cred) return null;
    cred.previousSecretHash = previousHash;
    cred.previousSecretGraceExpiresAt = graceExpiresAt;
    cred.secretHash = newHash;
    await this.redis.set(key('client', clientId), JSON.stringify(cred));
    return cred;
  }

  async recordFailedAuth(clientId) {
    const k = key('failedauth', clientId);
    const count = await this.redis.incr(k);
    if (count === 1) {
      await this.redis.expire(k, 3600);
    }
    return count;
  }

  async getFailedAuthCount(clientId) {
    const count = await this.redis.get(key('failedauth', clientId));
    return count ? parseInt(count, 10) : 0;
  }

  async resetFailedAuth(clientId) {
    await this.redis.del(key('failedauth', clientId));
  }

  async lockClient(clientId) {
    await this.redis.set(key('locked', clientId), '1');
  }

  async isClientLocked(clientId) {
    const val = await this.redis.get(key('locked', clientId));
    return val === '1';
  }

  // Groups
  async createGroup(groupId, data) {
    const record = { ...data, groupId, ready: false, createdAt: new Date().toISOString() };
    await this.redis.set(key('group', groupId), JSON.stringify(record));
    if (data.xmtpGroupId) {
      await this.redis.set(key('xmtp-group', data.xmtpGroupId), groupId);
    }
  }

  async getGroup(groupId) {
    const raw = await this.redis.get(key('group', groupId));
    return raw ? JSON.parse(raw) : null;
  }

  async setGroupReady(groupId) {
    const group = await this.getGroup(groupId);
    if (group) {
      group.ready = true;
      await this.redis.set(key('group', groupId), JSON.stringify(group));
    }
  }

  async isGroupReady(groupId) {
    const group = await this.getGroup(groupId);
    return group ? group.ready : false;
  }

  async getGroupByXmtpId(xmtpGroupId) {
    const groupId = await this.redis.get(key('xmtp-group', xmtpGroupId));
    if (!groupId) return null;
    return this.getGroup(groupId);
  }

  async recordMemberJoin(xmtpGroupId, joinerInboxId) {
    await this.redis.sadd(key('joins', xmtpGroupId), joinerInboxId);
  }

  async getJoinCount(xmtpGroupId) {
    return this.redis.scard(key('joins', xmtpGroupId));
  }

  // App icons
  async storeAppIcon(namespace, { contentType, data }) {
    await this.redis.set(
      key('icon', namespace),
      JSON.stringify({ contentType, data: data.toString('base64') }),
    );
  }

  async getAppIcon(namespace) {
    const raw = await this.redis.get(key('icon', namespace));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { contentType: parsed.contentType, data: Buffer.from(parsed.data, 'base64') };
  }

  // Invites
  async createInvite(inviteId, data) {
    const invite = { ...data, inviteId, status: 'pending', createdAt: new Date().toISOString() };
    const k = key('invite', inviteId);
    await this.redis.set(k, JSON.stringify(invite));
    if (data.ttlSeconds) {
      await this.redis.expire(k, data.ttlSeconds);
    }
  }

  async getInvite(inviteId) {
    const raw = await this.redis.get(key('invite', inviteId));
    return raw ? JSON.parse(raw) : null;
  }

  // Pairing verifications
  async markPairingVerified(groupId, pairingIdentifier, data) {
    const record = { ...data, groupId, pairingIdentifier, verifiedAt: new Date().toISOString() };
    const k = key('pairing-verified', groupId, pairingIdentifier);
    await this.redis.set(k, JSON.stringify(record));
    if (data.ttlSeconds) {
      await this.redis.expire(k, data.ttlSeconds);
    }
    return record;
  }

  async getPairingVerification(groupId, pairingIdentifier) {
    const raw = await this.redis.get(key('pairing-verified', groupId, pairingIdentifier));
    return raw ? JSON.parse(raw) : null;
  }

  // Join tokens
  async storeJoinToken(jti, data) {
    const record = { ...data, consumed: false };
    const k = key('join', jti);
    await this.redis.set(k, JSON.stringify(record));
    if (data.ttlSeconds) {
      await this.redis.expire(k, data.ttlSeconds);
    }
  }

  async getJoinToken(jti) {
    const raw = await this.redis.get(key('join', jti));
    return raw ? JSON.parse(raw) : null;
  }

  async consumeJoinToken(jti) {
    const token = await this.getJoinToken(jti);
    if (!token || token.consumed) return false;
    token.consumed = true;
    await this.redis.set(key('join', jti), JSON.stringify(token));
    return true;
  }

  // Approval tokens
  async storeApprovalToken(token, data) {
    const record = { ...data, consumed: false };
    const k = key('approval', token);
    await this.redis.set(k, JSON.stringify(record));
    if (data.ttlSeconds) {
      await this.redis.expire(k, data.ttlSeconds);
    }
  }

  async getApprovalToken(token) {
    const raw = await this.redis.get(key('approval', token));
    return raw ? JSON.parse(raw) : null;
  }

  async consumeApprovalToken(token) {
    const entry = await this.getApprovalToken(token);
    if (!entry || entry.consumed) return false;
    entry.consumed = true;
    await this.redis.set(key('approval', token), JSON.stringify(entry));
    return true;
  }

  // Health check cache
  async setHealthCheckResult(namespace, healthy) {
    const k = key('healthcheck', namespace);
    await this.redis.set(k, JSON.stringify({ healthy, checkedAt: new Date().toISOString() }));
    await this.redis.expire(k, 120); // 2x check interval
  }

  async getHealthCheckResult(namespace) {
    const raw = await this.redis.get(key('healthcheck', namespace));
    if (!raw) return null;
    return JSON.parse(raw).healthy;
  }

  // Client revocation
  async markClientRevoked(clientId, revokedAt) {
    await this.redis.set(key('revoked', clientId), revokedAt);
  }

  async isClientRevoked(clientId) {
    const val = await this.redis.get(key('revoked', clientId));
    return val !== null;
  }

  async invalidateNamespaceInvites(namespace) {
    // In production, use SCAN to find matching keys
    // For now, we rely on the caller knowing invite IDs
    // This is a simplified implementation
  }

  // Lifecycle
  async isHealthy() {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  async close() {
    await this.redis.quit();
  }
}
