import { XmtpAgent } from './XmtpAgent.js';

export { AgentInterface } from './AgentInterface.js';
export { MockAgent } from './MockAgent.js';
export { XmtpAgent } from './XmtpAgent.js';

export function createAgent(config, storage, logger) {
  if (!config.xmtpAgentKey) {
    logger.info('No XMTP_AGENT_KEY set — agent will generate an ephemeral key');
  }
  return new XmtpAgent(config, storage, logger);
}
