import { loadConfig } from '../../lib/config.js';
import { createLogger } from '../../lib/logger.js';

export const TEST_SECRETS = {
  ACCESS_TOKEN_SECRET: 'test-access-token-secret-min-32-chars!!',
  INVITE_TOKEN_SECRET: 'test-invite-token-secret-min-32-chars!!',
  APPROVAL_TOKEN_SECRET: 'test-approval-token-secret-min-32chars!',
  ADMIN_TOKEN: 'test-admin-token',
};

export function createTestConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    PORT: '3000',
    BASE_URL: 'http://localhost:3000',
    ...TEST_SECRETS,
    ...overrides,
  });
}

export function createTestLogger() {
  return createLogger(createTestConfig());
}
