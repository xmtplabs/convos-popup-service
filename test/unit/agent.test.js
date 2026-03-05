import { describe, it, expect, beforeEach } from 'vitest';
import { MockAgent } from '../../lib/agent/MockAgent.js';
import { XmtpAgent } from '../../lib/agent/XmtpAgent.js';
import { createAgent } from '../../lib/agent/index.js';
import { createTestConfig, createTestLogger } from '../helpers/setup.js';

describe('MockAgent', () => {
  let agent;

  beforeEach(async () => {
    agent = new MockAgent();
    await agent.init();
  });

  it('reports connected after init', () => {
    expect(agent.isConnected()).toBe(true);
  });

  it('creates groups with IDs and per-user invite codes', async () => {
    const pairingCodes = { '@alice': 'pc_aaa', '@bob': 'pc_bbb' };
    const result = await agent.createGroup('Test Group', 'A description', pairingCodes);
    expect(result.groupId).toMatch(/^xmtp_grp_/);
    expect(result.inviteCodes['@alice'].code).toBe('pc_aaa');
    expect(result.inviteCodes['@alice'].joinUrl).toContain(result.groupId);
    expect(result.inviteCodes['@bob'].code).toBe('pc_bbb');
    expect(result.inviteCodes['@bob'].joinUrl).toContain(result.groupId);
  });

  it('tracks connection state through close', async () => {
    expect(agent.isConnected()).toBe(true);
    await agent.close();
    expect(agent.isConnected()).toBe(false);
  });

  it('supports simulateJoin test helper', async () => {
    const result = await agent.createGroup('Test', null, { '@alice': 'pc_aaa' });
    agent.simulateJoin(result.groupId, 'user_1');
    const group = agent.getGroup(result.groupId);
    expect(group.members).toContain('user_1');
  });
});

describe('createAgent factory', () => {
  it('always returns XmtpAgent', () => {
    const config = createTestConfig();
    const logger = createTestLogger();
    const agent = createAgent(config, null, logger);
    expect(agent).toBeInstanceOf(XmtpAgent);
  });

  it('returns XmtpAgent when XMTP_AGENT_KEY is set', () => {
    const config = createTestConfig({ XMTP_AGENT_KEY: '0xtest' });
    const logger = createTestLogger();
    const agent = createAgent(config, null, logger);
    expect(agent).toBeInstanceOf(XmtpAgent);
  });
});
