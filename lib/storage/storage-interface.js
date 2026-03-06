export class StorageInterface {
  // Namespace CRUD
  async createNamespace(data) {
    throw new Error('Not implemented');
  }
  async getNamespace(namespace) {
    throw new Error('Not implemented');
  }
  async getNamespaceByClientId(clientId) {
    throw new Error('Not implemented');
  }
  async updateNamespace(namespace, updates) {
    throw new Error('Not implemented');
  }
  async activateNamespace(namespace) {
    throw new Error('Not implemented');
  }
  async revokeNamespace(namespace) {
    throw new Error('Not implemented');
  }

  // Client credentials
  async storeClientCredentials(clientId, data) {
    throw new Error('Not implemented');
  }
  async getClientCredentials(clientId) {
    throw new Error('Not implemented');
  }
  async updateClientSecretHash(clientId, newHash, previousHash, graceExpiresAt) {
    throw new Error('Not implemented');
  }
  async recordFailedAuth(clientId) {
    throw new Error('Not implemented');
  }
  async getFailedAuthCount(clientId) {
    throw new Error('Not implemented');
  }
  async resetFailedAuth(clientId) {
    throw new Error('Not implemented');
  }
  async lockClient(clientId) {
    throw new Error('Not implemented');
  }
  async isClientLocked(clientId) {
    throw new Error('Not implemented');
  }

  // Groups
  async createGroup(groupId, data) {
    throw new Error('Not implemented');
  }
  async getGroup(groupId) {
    throw new Error('Not implemented');
  }
  async setGroupReady(groupId) {
    throw new Error('Not implemented');
  }
  async isGroupReady(groupId) {
    throw new Error('Not implemented');
  }
  async getGroupByXmtpId(xmtpGroupId) {
    throw new Error('Not implemented');
  }
  async recordMemberJoin(xmtpGroupId, joinerInboxId) {
    throw new Error('Not implemented');
  }
  async getJoinCount(xmtpGroupId) {
    throw new Error('Not implemented');
  }

  // App icons
  async storeAppIcon(namespace, { contentType, data }) {
    throw new Error('Not implemented');
  }
  async getAppIcon(namespace) {
    throw new Error('Not implemented');
  }

  // Invites
  async createInvite(inviteId, data) {
    throw new Error('Not implemented');
  }
  async getInvite(inviteId) {
    throw new Error('Not implemented');
  }
  // Pairing verifications
  async markPairingVerified(groupId, pairingIdentifier, data) {
    throw new Error('Not implemented');
  }
  async getPairingVerification(groupId, pairingIdentifier) {
    throw new Error('Not implemented');
  }

  // Join tokens
  async storeJoinToken(jti, data) {
    throw new Error('Not implemented');
  }
  async getJoinToken(jti) {
    throw new Error('Not implemented');
  }
  async consumeJoinToken(jti) {
    throw new Error('Not implemented');
  }

  // Approval tokens
  async storeApprovalToken(token, data) {
    throw new Error('Not implemented');
  }
  async getApprovalToken(token) {
    throw new Error('Not implemented');
  }
  async consumeApprovalToken(token) {
    throw new Error('Not implemented');
  }

  // Health check cache
  async setHealthCheckResult(namespace, healthy) {
    throw new Error('Not implemented');
  }
  async getHealthCheckResult(namespace) {
    throw new Error('Not implemented');
  }

  // Client revocation tracking
  async markClientRevoked(clientId, revokedAt) {
    throw new Error('Not implemented');
  }
  async isClientRevoked(clientId) {
    throw new Error('Not implemented');
  }
  async invalidateNamespaceInvites(namespace) {
    throw new Error('Not implemented');
  }

  // Lifecycle
  async isHealthy() {
    throw new Error('Not implemented');
  }
  async close() {
    throw new Error('Not implemented');
  }
}
