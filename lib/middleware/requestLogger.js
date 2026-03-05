import pinoHttp from 'pino-http';

export function createRequestLogger(logger) {
  return pinoHttp({ logger });
}
