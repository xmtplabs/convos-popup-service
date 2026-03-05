export async function startServer(app, config, { agent, healthChecker, logger, storage }) {
  // Initialize agent
  if (agent) {
    try {
      await agent.init();
      logger.info('Agent initialized');
    } catch (err) {
      logger.fatal({ err }, 'Failed to initialize XMTP agent — cannot start without agent');
      process.exit(1);
    }
  }

  // Start health checker
  if (healthChecker) {
    healthChecker.start();
  }

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'Popup service started');
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down...');

    if (healthChecker) healthChecker.stop();

    server.close(async () => {
      if (agent) await agent.close();
      if (storage) await storage.close();
      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Force exit after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}
