import client from 'prom-client';

export function createMetrics() {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });

  const requestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [registry],
  });

  const requestCount = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });

  const groupsCreated = new client.Counter({
    name: 'popup_groups_created_total',
    help: 'Total groups created',
    registers: [registry],
  });

  const verifications = new client.Counter({
    name: 'popup_verifications_total',
    help: 'Total user verifications',
    registers: [registry],
  });

  const tokenExchanges = new client.Counter({
    name: 'popup_token_exchanges_total',
    help: 'Total token exchanges',
    labelNames: ['status', 'namespace'],
    registers: [registry],
  });

  const activeGroups = new client.Gauge({
    name: 'popup_active_groups',
    help: 'Number of active groups',
    registers: [registry],
  });

  return {
    registry,
    requestDuration,
    requestCount,
    groupsCreated,
    verifications,
    tokenExchanges,
    activeGroups,
  };
}
