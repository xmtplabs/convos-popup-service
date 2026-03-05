export function loadConfig(env = process.env) {
  return Object.freeze({
    port: parseInt(env.PX_PORT || '4000', 10),
    popupServiceUrl: env.POPUP_SERVICE_URL || 'http://localhost:3000',
    namespace: env.PX_NAMESPACE || 'test-x',
    displayName: env.PX_DISPLAY_NAME || 'Test X Service',
    contactEmail: env.PX_CONTACT_EMAIL || 'test@example.com',
    nodeEnv: env.NODE_ENV || 'development',
  });
}
