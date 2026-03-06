import { StorageInterface } from './storage-interface.js';

export class MemoryStorage extends StorageInterface {
  constructor() {
    super();
    this.namespaces = new Map();
    this.clientCredentials = new Map();
    this.groups = new Map();
    this.invites = new Map();
    this.joinTokens = new Map();
    this.approvalTokens = new Map();
    this.healthChecks = new Map();
    this.failedAuths = new Map();
    this.lockedClients = new Set();
    this.revokedClients = new Map();
    this.pairingVerifications = new Map();
    this.memberJoins = new Map();
    this.appIcons = new Map();
    this._timers = [];
  }

  _setExpiry(map, key, ttlMs) {
    const timer = setTimeout(() => map.delete(key), ttlMs);
    timer.unref?.();
    this._timers.push(timer);
  }

  // Namespace CRUD
  async createNamespace(data) {
    if (this.namespaces.has(data.namespace)) {
      throw new Error('DUPLICATE');
    }
    this.namespaces.set(data.namespace, { ...data, status: 'pending_approval', createdAt: new Date().toISOString() });
  }

  async getNamespace(namespace) {
    return this.namespaces.get(namespace) || null;
  }

  async getNamespaceByClientId(clientId) {
    for (const ns of this.namespaces.values()) {
      if (ns.clientId === clientId) return ns;
    }
    return null;
  }

  async updateNamespace(namespace, updates) {
    const ns = this.namespaces.get(namespace);
    if (!ns) return null;
    Object.assign(ns, updates, { updatedAt: new Date().toISOString() });
    return ns;
  }

  async activateNamespace(namespace) {
    const ns = this.namespaces.get(namespace);
    if (!ns) return null;
    ns.status = 'active';
    ns.activatedAt = new Date().toISOString();
    return ns;
  }

  async revokeNamespace(namespace) {
    const ns = this.namespaces.get(namespace);
    if (!ns) return null;
    ns.status = 'revoked';
    ns.revokedAt = new Date().toISOString();
    return ns;
  }

  // Client credentials
  async storeClientCredentials(clientId, data) {
    this.clientCredentials.set(clientId, { ...data });
  }

  async getClientCredentials(clientId) {
    return this.clientCredentials.get(clientId) || null;
  }

  async updateClientSecretHash(clientId, newHash, previousHash, graceExpiresAt) {
    const cred = this.clientCredentials.get(clientId);
    if (!cred) return null;
    cred.previousSecretHash = previousHash;
    cred.previousSecretGraceExpiresAt = graceExpiresAt;
    cred.secretHash = newHash;
    return cred;
  }

  async recordFailedAuth(clientId) {
    const count = (this.failedAuths.get(clientId) || 0) + 1;
    this.failedAuths.set(clientId, count);
    // Auto-clear after lockout window
    if (count === 1) {
      this._setExpiry(this.failedAuths, clientId, 3600 * 1000);
    }
    return count;
  }

  async getFailedAuthCount(clientId) {
    return this.failedAuths.get(clientId) || 0;
  }

  async resetFailedAuth(clientId) {
    this.failedAuths.delete(clientId);
  }

  async lockClient(clientId) {
    this.lockedClients.add(clientId);
  }

  async isClientLocked(clientId) {
    return this.lockedClients.has(clientId);
  }

  // Groups
  async createGroup(groupId, data) {
    this.groups.set(groupId, { ...data, groupId, ready: false, createdAt: new Date().toISOString() });
  }

  async getGroup(groupId) {
    return this.groups.get(groupId) || null;
  }

  async setGroupReady(groupId) {
    const group = this.groups.get(groupId);
    if (group) group.ready = true;
  }

  async isGroupReady(groupId) {
    const group = this.groups.get(groupId);
    return group ? group.ready : false;
  }

  async getGroupByXmtpId(xmtpGroupId) {
    for (const group of this.groups.values()) {
      if (group.xmtpGroupId === xmtpGroupId) return group;
    }
    return null;
  }

  async recordMemberJoin(xmtpGroupId, joinerInboxId) {
    if (!this.memberJoins.has(xmtpGroupId)) {
      this.memberJoins.set(xmtpGroupId, new Set());
    }
    this.memberJoins.get(xmtpGroupId).add(joinerInboxId);
  }

  async getJoinCount(xmtpGroupId) {
    const joins = this.memberJoins.get(xmtpGroupId);
    return joins ? joins.size : 0;
  }

  // App icons
  async storeAppIcon(namespace, { contentType, data }) {
    this.appIcons.set(namespace, { contentType, data });
  }

  async getAppIcon(namespace) {
    return this.appIcons.get(namespace) || null;
  }

  // Invites
  async createInvite(inviteId, data) {
    const invite = { ...data, inviteId, status: 'pending', createdAt: new Date().toISOString() };
    this.invites.set(inviteId, invite);
    if (data.ttlMs) {
      this._setExpiry(this.invites, inviteId, data.ttlMs);
    }
  }

  async getInvite(inviteId) {
    return this.invites.get(inviteId) || null;
  }

  // Pairing verifications
  async markPairingVerified(groupId, pairingIdentifier, data) {
    const k = `${groupId}:${pairingIdentifier}`;
    const record = { ...data, groupId, pairingIdentifier, verifiedAt: new Date().toISOString() };
    this.pairingVerifications.set(k, record);
    return record;
  }

  async getPairingVerification(groupId, pairingIdentifier) {
    return this.pairingVerifications.get(`${groupId}:${pairingIdentifier}`) || null;
  }

  // Join tokens
  async storeJoinToken(jti, data) {
    this.joinTokens.set(jti, { ...data, consumed: false });
    if (data.ttlMs) {
      this._setExpiry(this.joinTokens, jti, data.ttlMs);
    }
  }

  async getJoinToken(jti) {
    return this.joinTokens.get(jti) || null;
  }

  async consumeJoinToken(jti) {
    const token = this.joinTokens.get(jti);
    if (!token) return false;
    if (token.consumed) return false;
    token.consumed = true;
    return true;
  }

  // Approval tokens
  async storeApprovalToken(token, data) {
    this.approvalTokens.set(token, { ...data, consumed: false });
    if (data.ttlMs) {
      this._setExpiry(this.approvalTokens, token, data.ttlMs);
    }
  }

  async getApprovalToken(token) {
    return this.approvalTokens.get(token) || null;
  }

  async consumeApprovalToken(token) {
    const entry = this.approvalTokens.get(token);
    if (!entry) return false;
    if (entry.consumed) return false;
    entry.consumed = true;
    return true;
  }

  // Health check cache
  async setHealthCheckResult(namespace, healthy) {
    this.healthChecks.set(namespace, { healthy, checkedAt: new Date().toISOString() });
  }

  async getHealthCheckResult(namespace) {
    const result = this.healthChecks.get(namespace);
    return result ? result.healthy : null;
  }

  // Client revocation
  async markClientRevoked(clientId, revokedAt) {
    this.revokedClients.set(clientId, revokedAt);
  }

  async isClientRevoked(clientId) {
    return this.revokedClients.has(clientId);
  }

  async invalidateNamespaceInvites(namespace) {
    for (const [id, invite] of this.invites) {
      if (invite.namespace === namespace) {
        this.invites.delete(id);
      }
    }
  }

  // Lifecycle
  async isHealthy() {
    return true;
  }

  async close() {
    for (const timer of this._timers) {
      clearTimeout(timer);
    }
    this._timers = [];
  }
}
