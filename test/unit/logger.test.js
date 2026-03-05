import { describe, it, expect } from 'vitest';
import { createLogger } from '../../lib/logger.js';

describe('createLogger', () => {
  it('returns a pino logger instance', () => {
    const logger = createLogger({ nodeEnv: 'test' });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('sets level to silent in test env', () => {
    const logger = createLogger({ nodeEnv: 'test' });
    expect(logger.level).toBe('silent');
  });
});
