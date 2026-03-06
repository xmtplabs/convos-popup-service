import { TwitterApi } from 'twitter-api-v2';

export function createTwitterClient({ apiKey, apiSecret, accessToken, accessSecret }) {
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
