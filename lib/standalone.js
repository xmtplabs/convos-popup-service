import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createStorage } from './storage/index.js';
import { createAgent } from './agent/index.js';
import { createMetrics } from './metrics/prometheus.js';
import { createNotifier } from './notifications.js';
import { HealthChecker } from './healthChecker.js';
import { createApp } from './app.js';
import { startServer } from './server.js';

const config = loadConfig();
const logger = createLogger(config);
const storage = await createStorage(config, logger);
const agent = createAgent(config, storage, logger);
const metrics = createMetrics();
const notifier = createNotifier(config, logger);
const healthChecker = new HealthChecker(storage, logger, config);

const app = createApp({ config, storage, agent, logger, metrics, notifier });
await startServer(app, config, { agent, healthChecker, logger, storage });
