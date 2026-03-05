export const RESERVED_NAMESPACES = [
  'admin',
  'system',
  'convos',
  'test',
  'internal',
];

export const TTL = {
  ACCESS_TOKEN_SECONDS: 3600, // 1 hour
  JOIN_TOKEN_SECONDS: 600, // 10 minutes
  APPROVAL_TOKEN_SECONDS: 7 * 24 * 3600, // 7 days
  INVITE_SECONDS: 7 * 24 * 3600, // 7 days
  SECRET_GRACE_PERIOD_SECONDS: 24 * 3600, // 24 hours
  LOCKOUT_WINDOW_SECONDS: 3600, // 1 hour
};

export const RATE_LIMITS = {
  register: { windowMs: 60 * 60 * 1000, max: 5 }, // 5/hour per IP
  authToken: { windowMs: 60 * 60 * 1000, max: 30 }, // 30/hour per client_id
  createGroup: { windowMs: 60 * 60 * 1000, max: 60 }, // 60/hour per namespace
  getGroup: { windowMs: 60 * 60 * 1000, max: 120 }, // 120/hour per namespace
  groupReady: { windowMs: 60 * 60 * 1000, max: 120 }, // 120/hour per namespace
  verify: { windowMs: 60 * 60 * 1000, max: 300 }, // 300/hour per namespace
  invitePage: { windowMs: 15 * 60 * 1000, max: 60 }, // 60/15min per IP
  joinPage: { windowMs: 15 * 60 * 1000, max: 20 }, // 20/15min per IP
};

export const LOCKOUT_MAX_FAILURES = 10;

export const KEY_PREFIX = 'popup';

export const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export const APP_ICON_MAX_BYTES = 256 * 1024; // 256 KB
export const APP_ICON_ALLOWED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
]);
