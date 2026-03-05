import rateLimit from 'express-rate-limit';
import { RATE_LIMITS } from '../constants.js';

export function createRateLimiters(config) {
  const limiters = {};

  for (const [name, opts] of Object.entries(RATE_LIMITS)) {
    limiters[name] = rateLimit({
      windowMs: opts.windowMs,
      max: opts.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'rate_limit_exceeded', error_description: 'Too many requests' },
      // Skip in test environment
      skip: () => config.nodeEnv === 'test',
    });
  }

  return limiters;
}
