export function createNotifier(config, logger) {
  return {
    async notifyApproval({ namespace, displayName, verificationEndpoint, contactEmail, approvalUrl }) {
      if (config.slackWebhookUrl) {
        logger.info({ namespace, approvalUrl }, 'Would send Slack notification (not implemented)');
      }
      logger.info(
        {
          event: 'namespace_registration',
          namespace,
          displayName,
          verificationEndpoint,
          contactEmail,
          approvalUrl,
        },
        `New namespace registration: "${namespace}". Approve: ${approvalUrl}`,
      );
    },
  };
}
