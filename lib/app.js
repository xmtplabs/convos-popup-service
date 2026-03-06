import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import { createRequestLogger } from './middleware/requestLogger.js';
import { createMetricsMiddleware } from './middleware/metricsMiddleware.js';
import { createBearerAuth } from './middleware/bearerAuth.js';
import { namespaceEnforcement } from './middleware/namespaceEnforcement.js';
import { createRateLimiters } from './middleware/rateLimits.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRoute } from './routes/health.js';
import { readyRoute } from './routes/ready.js';
import { connectRoutes } from './routes/connect.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { groupRoutes } from './routes/groups.js';
import { verifyRoutes } from './routes/verify.js';
import { inviteRoutes } from './routes/invite.js';
import { joinRoutes } from './routes/join.js';
import { iconRoutes } from './routes/icons.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ config, storage, agent, logger, metrics, notifier }) {
  const app = express();

  // View engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Global middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  if (logger && config.nodeEnv !== 'test') {
    app.use(createRequestLogger(logger));
  }
  if (metrics) {
    app.use(createMetricsMiddleware(metrics));
  }

  const limiters = createRateLimiters(config);

  // Public routes
  app.use(healthRoute());
  app.use(readyRoute(storage, agent));
  // Connect routes (registration is public, rotate/patch need auth)
  const connectRouter = connectRoutes(config, storage, notifier);
  app.post('/connect/register', limiters.register, connectRouter);
  app.get('/connect/approve/:approvalToken', connectRouter);

  // Auth token (public but rate-limited)
  app.use(authRoutes(config, storage, metrics));

  // User-facing pages (public)
  app.use(inviteRoutes(config, storage));
  app.use(joinRoutes(config, storage));
  app.use(iconRoutes(storage));

  // Authenticated connect client routes
  const bearerAuth = createBearerAuth(config, storage);
  app.post('/connect/rotate-secret', bearerAuth, connectRouter);
  app.patch('/connect/namespace', bearerAuth, connectRouter);

  // Admin routes
  app.use('/admin', adminRoutes(config, storage, logger));

  // Authenticated API routes
  app.use(
    '/api/v1/namespaces/:namespace/groups',
    bearerAuth,
    namespaceEnforcement(),
    groupRoutes(config, storage, agent, metrics),
  );
  app.use(
    '/api/v1/namespaces/:namespace/verify',
    bearerAuth,
    namespaceEnforcement(),
    verifyRoutes(config, storage, metrics),
  );

  // Error handler
  app.use(errorHandler(config));

  return app;
}
