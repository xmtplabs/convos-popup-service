export class AgentInterface {
  async init() {
    throw new Error('Not implemented');
  }

  async createGroup(title, description, pairingCodes) {
    throw new Error('Not implemented');
  }

  async promoteAllMembers(groupId) {
    throw new Error('Not implemented');
  }

  async leaveGroup(groupId) {
    throw new Error('Not implemented');
  }

  isConnected() {
    throw new Error('Not implemented');
  }

  async close() {
    throw new Error('Not implemented');
  }
}
