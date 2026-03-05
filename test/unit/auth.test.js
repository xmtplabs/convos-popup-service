import { describe, it, expect } from 'vitest';
import { createTestConfig } from '../helpers/setup.js';
import {
  signAccessToken,
  verifyAccessToken,
  signJoinToken,
  verifyJoinToken,
  signApprovalToken,
  verifyApprovalToken,
} from '../../lib/auth/tokens.js';
import {
  generateClientId,
  generateClientSecret,
  hashSecret,
  verifySecret,
  generateInviteId,
  generateGroupId,
  generateJoinTokenId,
  generateApprovalToken,
} from '../../lib/auth/credentials.js';

const config = createTestConfig();

describe('tokens', () => {
  describe('access tokens', () => {
    it('signs and verifies round-trip', async () => {
      const token = await signAccessToken(config, {
        clientId: 'cps_live_abc',
        namespace: 'x-twitter',
        scope: 'groups:write pairing:write verify:write',
      });
      const payload = await verifyAccessToken(config, token);
      expect(payload.sub).toBe('cps_live_abc');
      expect(payload.namespace).toBe('x-twitter');
      expect(payload.scope).toBe('groups:write pairing:write verify:write');
    });

    it('rejects with wrong secret', async () => {
      const token = await signAccessToken(config, {
        clientId: 'cps_live_abc',
        namespace: 'x-twitter',
        scope: 'groups:write',
      });
      const badConfig = createTestConfig({ ACCESS_TOKEN_SECRET: 'wrong-secret-that-is-long-enough!!' });
      await expect(verifyAccessToken(badConfig, token)).rejects.toThrow();
    });
  });

  describe('join tokens', () => {
    it('signs and verifies round-trip', async () => {
      const token = await signJoinToken(config, {
        sub: '@alice',
        groupId: 'grp_1',
        inviteId: 'inv_1',
        namespace: 'x-twitter',
        jti: 'tok_1',
      });
      const payload = await verifyJoinToken(config, token);
      expect(payload.sub).toBe('@alice');
      expect(payload.gid).toBe('grp_1');
      expect(payload.inv).toBe('inv_1');
      expect(payload.ns).toBe('x-twitter');
      expect(payload.jti).toBe('tok_1');
    });
  });

  describe('approval tokens', () => {
    it('signs and verifies round-trip', async () => {
      const token = await signApprovalToken(config, {
        namespace: 'x-twitter',
        token: 'approval_abc',
      });
      const payload = await verifyApprovalToken(config, token);
      expect(payload.namespace).toBe('x-twitter');
      expect(payload.tok).toBe('approval_abc');
    });
  });
});

describe('credentials', () => {
  it('generates client IDs with prefix', () => {
    const id = generateClientId();
    expect(id).toMatch(/^cps_live_[a-f0-9]{32}$/);
  });

  it('generates client secrets with prefix', () => {
    const secret = generateClientSecret();
    expect(secret).toMatch(/^cps_secret_[a-f0-9]{64}$/);
  });

  it('hashes and verifies secrets with argon2id', async () => {
    const secret = 'my-test-secret';
    const hash = await hashSecret(secret);
    expect(hash).toContain('$argon2id$');
    expect(await verifySecret(hash, secret)).toBe(true);
    expect(await verifySecret(hash, 'wrong')).toBe(false);
  });

  it('generates invite IDs with prefix', () => {
    expect(generateInviteId()).toMatch(/^inv_[a-f0-9]{32}$/);
  });

  it('generates group IDs with prefix', () => {
    expect(generateGroupId()).toMatch(/^grp_[a-f0-9]{32}$/);
  });

  it('generates join token IDs with prefix', () => {
    expect(generateJoinTokenId()).toMatch(/^tok_[a-f0-9]{32}$/);
  });

  it('generates approval tokens', () => {
    const token = generateApprovalToken();
    expect(token).toHaveLength(64);
  });
});
