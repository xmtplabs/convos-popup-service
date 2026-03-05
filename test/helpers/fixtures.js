export const FIXTURES = {
  namespace: {
    valid: {
      namespace: 'x-twitter',
      displayName: 'X/Twitter',
      verificationEndpoint: 'https://connect.example.com/verify',
      appIconUrl: 'https://example.com/icon.png',
      contactEmail: 'ops@example.com',
    },
    discord: {
      namespace: 'discord',
      displayName: 'Discord',
      verificationEndpoint: 'https://discord-connect.example.com/verify',
      appIconUrl: 'https://discord-connect.example.com/icon.png',
      contactEmail: 'discord-ops@example.com',
    },
  },
  pairingIdentifiers: ['@alice', '@bob'],
  group: {
    title: 'Chat between @alice and @bob',
    description: 'A test group',
    pairingIdentifiers: ['@alice', '@bob'],
  },
};
