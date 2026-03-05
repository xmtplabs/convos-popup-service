import pino from 'pino';

export function createLogger(config) {
  const options = {
    level: config.nodeEnv === 'test' ? 'silent' : 'info',
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  };

  if (config.nodeEnv === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: { colorize: true },
    };
  }

  return pino(options);
}
