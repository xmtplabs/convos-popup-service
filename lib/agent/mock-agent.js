import { randomBytes } from 'node:crypto';
import { AgentInterface } from './agent-interface.js';

export class MockAgent extends AgentInterface {
  constructor() {
    super();
    this._connected = false;
    this._groups = new Map();
  }

  async init() {
    this._connected = true;
  }

  async createGroup(title, description, pairingCodes) {
    const groupId = `xmtp_grp_${randomBytes(8).toString('hex')}`;
    const inviteCodes = {};
    if (pairingCodes) {
      for (const [pairingId, code] of Object.entries(pairingCodes)) {
        const inviteId = randomBytes(8).toString('hex');
        inviteCodes[pairingId] = {
          code,
          joinUrl: `https://convos.example.com/join/${groupId}/${inviteId}`,
        };
      }
    }
    this._groups.set(groupId, { title, description, members: [], inviteCodes });
    return { groupId, inviteCodes };
  }

  async promoteAllMembers(groupId) {
    // Mock: no-op
  }

  async leaveGroup(groupId) {
    this._groups.delete(groupId);
  }

  isConnected() {
    return this._connected;
  }

  async close() {
    this._connected = false;
  }

  // Test helpers
  simulateJoin(groupId, memberId) {
    const group = this._groups.get(groupId);
    if (group) {
      group.members.push(memberId);
    }
  }

  getGroup(groupId) {
    return this._groups.get(groupId) || null;
  }
}
