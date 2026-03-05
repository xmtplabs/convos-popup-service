import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../lib/config.js';

describe('loadConfig', () => {
  it('returns frozen config with defaults', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.baseUrl).toBe('http://localhost:3000');
    expect(config.redisUrl).toBeNull();
    expect(config.xmtpAgentKey).toBeNull();
    expect(config.xmtpDbEncryptionKey).toBeNull();
    expect(config.xmtpEnv).toBe('dev');
    expect(config.xmtpDbDirectory).toBe('.convos-agent');
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('respects overrides from env', () => {
    const config = loadConfig({
      PORT: '4000',
      NODE_ENV: 'production',
      BASE_URL: 'https://popup.example.com',
      REDIS_URL: 'redis://redis:6379',
      ACCESS_TOKEN_SECRET: 'my-secret',
    });
    expect(config.port).toBe(4000);
    expect(config.nodeEnv).toBe('production');
    expect(config.baseUrl).toBe('https://popup.example.com');
    expect(config.redisUrl).toBe('redis://redis:6379');
    expect(config.accessTokenSecret).toBe('my-secret');
  });

  it('respects XMTP config overrides', () => {
    const config = loadConfig({
      XMTP_AGENT_KEY: '0xabc',
      XMTP_DB_ENCRYPTION_KEY: 'deadbeef',
      XMTP_ENV: 'production',
      XMTP_DB_DIRECTORY: '/data/xmtp',
    });
    expect(config.xmtpAgentKey).toBe('0xabc');
    expect(config.xmtpDbEncryptionKey).toBe('deadbeef');
    expect(config.xmtpEnv).toBe('production');
    expect(config.xmtpDbDirectory).toBe('/data/xmtp');
  });
});
