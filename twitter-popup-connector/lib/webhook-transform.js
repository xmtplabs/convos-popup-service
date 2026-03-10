/**
 * Transform a v1.1 Account Activity API tweet object into the v2 shape
 * that bot.processTweet(tweet, includes) expects.
 */
export function transformV1Tweet(v1) {
  const text = v1.extended_tweet?.full_text || v1.full_text || v1.text;

  const mentions = (v1.entities?.user_mentions || []).map((m) => ({
    username: m.screen_name,
    id: m.id_str,
  }));

  const referencedTweets = [];
  if (v1.in_reply_to_status_id_str) {
    referencedTweets.push({ type: 'replied_to', id: v1.in_reply_to_status_id_str });
  }

  const tweet = {
    id: v1.id_str,
    author_id: v1.user.id_str,
    text,
    entities: mentions.length > 0 ? { mentions } : undefined,
    referenced_tweets: referencedTweets.length > 0 ? referencedTweets : undefined,
  };

  // Build includes.users from the author + mentioned users
  const usersMap = new Map();
  usersMap.set(v1.user.id_str, { id: v1.user.id_str, username: v1.user.screen_name });
  for (const m of v1.entities?.user_mentions || []) {
    usersMap.set(m.id_str, { id: m.id_str, username: m.screen_name });
  }

  const includes = { users: [...usersMap.values()] };

  return { tweet, includes };
}
