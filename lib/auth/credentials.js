import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export function generateClientId() {
  return `cps_live_${randomBytes(16).toString('hex')}`;
}

export function generateClientSecret() {
  return `cps_secret_${randomBytes(32).toString('hex')}`;
}

export async function hashSecret(secret) {
  return argon2.hash(secret, { type: argon2.argon2id });
}

export async function verifySecret(hash, secret) {
  try {
    return await argon2.verify(hash, secret);
  } catch {
    return false;
  }
}

export function generateInviteId() {
  return randomBytes(16).toString('base64url');
}

export function generateJoinTokenId() {
  return `tok_${randomBytes(16).toString('hex')}`;
}

export function generateGroupId() {
  return `grp_${randomBytes(16).toString('hex')}`;
}

export function generateApprovalToken() {
  return randomBytes(32).toString('hex');
}

export function generatePairingCode() {
  return `pc_${randomBytes(12).toString('hex')}`;
}
