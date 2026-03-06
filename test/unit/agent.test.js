import { describe, it, expect } from 'vitest';
import { XmtpAgent } from '../../lib/agent/xmtp-agent.js';
import { createAgent } from '../../lib/agent/index.js';
import { createTestConfig, createTestLogger } from '../helpers/setup.js';

describe('createAgent factory', () => {
  it('always returns XmtpAgent', () => {
    const config = createTestConfig();
    const logger = createTestLogger();
    const agent = createAgent(config, null, logger, null);
    expect(agent).toBeInstanceOf(XmtpAgent);
  });
});
