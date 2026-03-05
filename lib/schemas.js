import { z } from 'zod';
import { RESERVED_NAMESPACES, NAMESPACE_PATTERN } from './constants.js';

function httpUrlSchema(requireHttps) {
  const base = z.string().url();
  if (requireHttps) {
    return base.startsWith('https://');
  }
  return base.refine((val) => val.startsWith('https://') || val.startsWith('http://'), {
    message: 'Must be a valid HTTP or HTTPS URL',
  });
}

export function createRegisterNamespaceSchema({ requireHttps = true } = {}) {
  return z.object({
    namespace: z
      .string()
      .min(3)
      .max(64)
      .regex(NAMESPACE_PATTERN, 'Must be lowercase alphanumeric with hyphens, 3-64 chars')
      .refine((val) => !RESERVED_NAMESPACES.includes(val), {
        message: 'This namespace is reserved',
      }),
    displayName: z.string().min(1).max(128),
    verificationEndpoint: httpUrlSchema(requireHttps),
    appIconUrl: httpUrlSchema(requireHttps),
    contactEmail: z.string().email(),
  });
}

export function createUpdateNamespaceSchema({ requireHttps = true } = {}) {
  return z
    .object({
      verificationEndpoint: httpUrlSchema(requireHttps).optional(),
      displayName: z.string().min(1).max(128).optional(),
      appIconUrl: httpUrlSchema(requireHttps).optional(),
      contactEmail: z.string().email().optional(),
    })
    .refine((data) => Object.values(data).some((v) => v !== undefined), {
      message: 'At least one field must be provided',
    });
}

// These don't depend on environment
export const tokenRequestSchema = z.object({
  grant_type: z.literal('client_credentials'),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});

export const createGroupSchema = z.object({
  title: z.string().min(1).max(256),
  description: z.string().max(1024).optional(),
  pairingIdentifiers: z.array(z.string().min(1)).min(2),
});

export const verifyUserSchema = z.object({
  pairingIdentifier: z.string().min(1),
  inviteId: z.string().min(1),
});

export const revokeClientSchema = z.object({
  clientId: z.string().min(1),
  reason: z.string().optional(),
});
