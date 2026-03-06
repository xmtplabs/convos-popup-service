export function loadConfig(env = process.env) {
  const config = {
    port: parseInt(env.PORT || '3000', 10),
    nodeEnv: env.NODE_ENV || 'development',
    baseUrl: env.BASE_URL || 'http://localhost:3000',
    redisUrl: env.REDIS_URL || null,
    accessTokenSecret: env.ACCESS_TOKEN_SECRET || 'dev-access-token-secret',
    inviteTokenSecret: env.INVITE_TOKEN_SECRET || 'dev-invite-token-secret',
    approvalTokenSecret:
      env.APPROVAL_TOKEN_SECRET || 'dev-approval-token-secret',
    adminToken: env.ADMIN_TOKEN || 'dev-admin-token',
    xmtpAgentKey: env.XMTP_AGENT_KEY || null,
    xmtpDbEncryptionKey: env.XMTP_DB_ENCRYPTION_KEY || null,
    xmtpEnv: env.XMTP_ENV || 'dev',
    xmtpDbDirectory: env.XMTP_DB_DIRECTORY || '.convos-agent',
    metricsPort: parseInt(env.METRICS_PORT || '9090', 10),
    healthCheckIntervalMs: parseInt(
      env.HEALTH_CHECK_INTERVAL_MS || '60000',
      10,
    ),
    healthCheckTimeoutMs: parseInt(env.HEALTH_CHECK_TIMEOUT_MS || '5000', 10),
    slackWebhookUrl: env.SLACK_WEBHOOK_URL || null,
  };

  if (config.baseUrl.includes('localhost')) {
    console.warn('WARNING: BASE_URL is not set, using default localhost. Set BASE_URL in environment.');
  }

  return Object.freeze(config);
}
