import { XmtpAgent } from './xmtp-agent.js';

export { AgentInterface } from './agent-interface.js';
export { MockAgent } from './mock-agent.js';
export { XmtpAgent } from './xmtp-agent.js';

export function createAgent(config, storage, logger, metrics) {
  if (!config.xmtpAgentKey) {
    logger.info('No XMTP_AGENT_KEY set — agent will generate an ephemeral key');
  }
  return new XmtpAgent(config, storage, logger, metrics);
}
