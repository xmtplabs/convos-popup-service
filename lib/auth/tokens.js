import { SignJWT, jwtVerify } from 'jose';
import { TTL } from '../constants.js';

function encodeSecret(secret) {
  return new TextEncoder().encode(secret);
}

// Access tokens (1hr, HS256)
export async function signAccessToken(config, { clientId, namespace, scope }) {
  return new SignJWT({ namespace, scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(config.baseUrl)
    .setSubject(clientId)
    .setAudience(`${config.baseUrl}/api/v1`)
    .setIssuedAt()
    .setExpirationTime(`${TTL.ACCESS_TOKEN_SECONDS}s`)
    .sign(encodeSecret(config.accessTokenSecret));
}

export async function verifyAccessToken(config, token) {
  const { payload } = await jwtVerify(token, encodeSecret(config.accessTokenSecret), {
    issuer: config.baseUrl,
    audience: `${config.baseUrl}/api/v1`,
  });
  return payload;
}

// Join tokens (10min, HS256, one-time use)
export async function signJoinToken(config, { sub, groupId, inviteId, namespace, jti }) {
  return new SignJWT({ gid: groupId, inv: inviteId, ns: namespace })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${TTL.JOIN_TOKEN_SECONDS}s`)
    .sign(encodeSecret(config.inviteTokenSecret));
}

export async function verifyJoinToken(config, token) {
  const { payload } = await jwtVerify(token, encodeSecret(config.inviteTokenSecret));
  return payload;
}

// Approval tokens (7d, HS256, single-use)
export async function signApprovalToken(config, { namespace, token }) {
  return new SignJWT({ namespace, tok: token })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TTL.APPROVAL_TOKEN_SECONDS}s`)
    .sign(encodeSecret(config.approvalTokenSecret));
}

export async function verifyApprovalToken(config, token) {
  const { payload } = await jwtVerify(token, encodeSecret(config.approvalTokenSecret));
  return payload;
}
