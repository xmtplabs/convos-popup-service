import { TwitterApi } from 'twitter-api-v2';

export function createAccountActivityClient({ config }) {
  const client = new TwitterApi({
    appKey: config.twitterApiKey,
    appSecret: config.twitterApiSecret,
    accessToken: config.twitterAccessToken,
    accessSecret: config.twitterAccessSecret,
  });

  const env = config.twitterWebhookEnv;
  const webhookUrl = `${config.baseUrl}/webhook/twitter`;

  async function getExistingWebhooks() {
    const res = await client.v1.get(`account_activity/all/${env}/webhooks.json`);
    return res || [];
  }

  async function registerWebhook() {
    return client.v1.post(`account_activity/all/${env}/webhooks.json`, { url: webhookUrl });
  }

  async function deleteWebhook(webhookId) {
    await client.v1.delete(`account_activity/all/${env}/webhooks/${webhookId}.json`);
  }

  async function subscribe() {
    await client.v1.post(`account_activity/all/${env}/subscriptions.json`);
  }

  async function setup() {
    const webhooks = await getExistingWebhooks();

    // Find one that already points to our URL
    const existing = webhooks.find((w) => w.url === webhookUrl);

    if (existing) {
      console.log(`[aaa] Reusing existing webhook ${existing.id} at ${webhookUrl}`);
    } else {
      // Remove stale webhooks (free tier allows only 1)
      for (const w of webhooks) {
        console.log(`[aaa] Removing stale webhook ${w.id} (${w.url})`);
        await deleteWebhook(w.id);
      }

      const created = await registerWebhook();
      console.log(`[aaa] Registered webhook ${created.id} at ${webhookUrl}`);
    }

    await subscribe();
    console.log(`[aaa] Bot subscribed to Account Activity API (env: ${env})`);
  }

  return { setup };
}
