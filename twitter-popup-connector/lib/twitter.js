import { TwitterApi } from 'twitter-api-v2';

export function createOAuth2TwitterClient({ tokenStore, config, refreshFn }) {
  const apiBaseUrl = config.twitterApiBaseUrl || 'https://api.twitter.com';
  let cachedBotUserId = null;
  let refreshPromise = null;

  async function getValidToken() {
    const tokenData = await tokenStore.load();
    if (!tokenData) {
      throw new Error('Bot not authorized. Visit /bot-auth to authorize.');
    }

    const now = Date.now();
    const expiresAt = tokenData.expires_at || 0;
    const fiveMinutes = 5 * 60 * 1000;

    if (now < expiresAt - fiveMinutes) {
      return tokenData.access_token;
    }

    // Prevent concurrent refresh races with a shared promise
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          console.log('Refreshing bot OAuth 2.0 token...');
          const fresh = await refreshFn(tokenData.refresh_token);
          const newTokenData = {
            access_token: fresh.access_token,
            refresh_token: fresh.refresh_token,
            expires_at: Date.now() + fresh.expires_in * 1000,
          };
          await tokenStore.save(newTokenData);
          console.log('Bot token refreshed successfully.');
          return newTokenData.access_token;
        } finally {
          refreshPromise = null;
        }
      })();
    }

    return refreshPromise;
  }

  async function apiFetch(path, options = {}) {
    const token = await getValidToken();
    const res = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Twitter API error: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async function getBotUserId() {
    if (cachedBotUserId) return cachedBotUserId;
    const data = await apiFetch('/2/users/me');
    cachedBotUserId = data.data.id;
    return cachedBotUserId;
  }

  async function getMentions(sinceId) {
    const userId = await getBotUserId();
    const params = new URLSearchParams();
    if (sinceId) params.set('since_id', sinceId);
    params.set('max_results', '100');
    params.set('expansions', 'author_id,entities.mentions.username,in_reply_to_user_id');
    params.set('tweet.fields', 'author_id,created_at,entities,in_reply_to_user_id,referenced_tweets');
    params.set('user.fields', 'username');
    const qs = params.toString();
    const data = await apiFetch(`/2/users/${userId}/mentions?${qs}`);
    return {
      tweets: data.data || [],
      includes: data.includes || {},
      meta: data.meta || {},
    };
  }

  async function getTweet(tweetId) {
    const data = await apiFetch(`/2/tweets/${tweetId}`);
    return {
      tweet: data.data,
      includes: data.includes || {},
    };
  }

  async function replyToTweet(tweetId, text) {
    return apiFetch('/2/tweets', {
      method: 'POST',
      body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: tweetId } }),
    });
  }

  return {
    getBotUserId,
    getMentions,
    getTweet,
    replyToTweet,
  };
}

export function createTwitterClient({ apiKey, apiSecret, accessToken, accessSecret, apiBaseUrl }) {
  if (apiBaseUrl) {
    return createFakeClient(apiBaseUrl, accessToken);
  }

  const client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret,
  });

  const v2 = client.v2;
  let cachedBotUserId = null;

  async function getBotUserId() {
    if (cachedBotUserId) return cachedBotUserId;
    const me = await v2.me();
    cachedBotUserId = me.data.id;
    return cachedBotUserId;
  }

  async function getMentions(sinceId) {
    const userId = await getBotUserId();
    const params = {
      expansions: ['author_id', 'entities.mentions.username', 'in_reply_to_user_id'],
      'tweet.fields': ['author_id', 'created_at', 'entities', 'in_reply_to_user_id', 'referenced_tweets'],
      'user.fields': ['username'],
      max_results: 100,
    };
    if (sinceId) params.since_id = sinceId;

    const response = await v2.userMentionTimeline(userId, params);
    return {
      tweets: response.data?.data || [],
      includes: response.data?.includes || {},
      meta: response.data?.meta || {},
    };
  }

  async function getTweet(tweetId) {
    const response = await v2.singleTweet(tweetId, {
      expansions: ['author_id'],
      'tweet.fields': ['author_id', 'entities', 'in_reply_to_user_id', 'referenced_tweets'],
      'user.fields': ['username'],
    });
    return {
      tweet: response.data,
      includes: response.includes || {},
    };
  }

  async function replyToTweet(tweetId, text) {
    return v2.tweet({
      text,
      reply: { in_reply_to_tweet_id: tweetId },
    });
  }

  return {
    getBotUserId,
    getMentions,
    getTweet,
    replyToTweet,
  };
}

function createFakeClient(apiBaseUrl, bearerToken) {
  let cachedBotUserId = null;

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Fake Twitter API error: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async function getBotUserId() {
    if (cachedBotUserId) return cachedBotUserId;
    const data = await apiFetch('/2/users/me');
    cachedBotUserId = data.data.id;
    return cachedBotUserId;
  }

  async function getMentions(sinceId) {
    const userId = await getBotUserId();
    const params = new URLSearchParams();
    if (sinceId) params.set('since_id', sinceId);
    const qs = params.toString();
    const data = await apiFetch(`/2/users/${userId}/mentions${qs ? '?' + qs : ''}`);
    return {
      tweets: data.data || [],
      includes: data.includes || {},
      meta: data.meta || {},
    };
  }

  async function getTweet(tweetId) {
    const data = await apiFetch(`/2/tweets/${tweetId}`);
    return {
      tweet: data.data,
      includes: data.includes || {},
    };
  }

  async function replyToTweet(tweetId, text) {
    return apiFetch('/2/tweets', {
      method: 'POST',
      body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: tweetId } }),
    });
  }

  return {
    getBotUserId,
    getMentions,
    getTweet,
    replyToTweet,
  };
}
