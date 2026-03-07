import * as responses from './responses.js';

export function createBot({ twitterClient, parser, popupClient, store, config }) {
  const botUsername = config.twitterBotUsername;
  let pollInterval = config.pollIntervalMs;
  let pollTimer = null;

  function resolveUsername(userId, includes) {
    const users = includes.users || [];
    const user = users.find((u) => u.id === userId);
    return user?.username || null;
  }

  function extractMentionedUsernames(tweet, includes) {
    const mentions = tweet.entities?.mentions || [];
    return mentions
      .map((m) => m.username)
      .filter((u) => u.toLowerCase() !== botUsername.toLowerCase());
  }

  async function walkReplyChain(tweet, depth = 3) {
    const authors = [];
    let current = tweet;

    for (let i = 0; i < depth; i++) {
      const repliedTo = current.referenced_tweets?.find((r) => r.type === 'replied_to');
      if (!repliedTo) break;

      try {
        const { tweet: parent, includes } = await twitterClient.getTweet(repliedTo.id);
        const authorUsername = resolveUsername(parent.author_id, includes);
        if (authorUsername && authorUsername.toLowerCase() !== botUsername.toLowerCase()) {
          authors.push(authorUsername);
        }
        current = parent;
      } catch {
        break;
      }
    }

    return authors;
  }

  async function processTweet(tweet, includes) {
    const tweetId = tweet.id;

    if (store.isProcessed(tweetId)) return;
    store.markProcessed(tweetId);

    const senderUsername = resolveUsername(tweet.author_id, includes);
    if (!senderUsername) return;

    console.log(`[bot] Processing tweet #${tweetId} from @${senderUsername}: "${tweet.text}"`);

    const mentionedUsernames = extractMentionedUsernames(tweet, includes);

    // No other @ mentions besides the bot — explain capabilities
    if (mentionedUsernames.length === 0) {
      try {
        await twitterClient.replyToTweet(tweetId, responses.capabilitiesResponse());
      } catch (err) {
        console.error(`Failed to reply with capabilities to ${tweetId}:`, err.message);
      }
      return;
    }

    // Walk reply chain for additional context
    const replyChainAuthors = await walkReplyChain(tweet);

    // Parse the tweet
    let parsed;
    try {
      parsed = await parser.parse({
        tweetText: tweet.text,
        senderUsername,
        mentionedUsernames,
        botUsername,
        replyChainAuthors,
      });
    } catch (err) {
      console.error(`Parser failed for ${tweetId}:`, err.message);
      try {
        await twitterClient.replyToTweet(tweetId, responses.errorResponse());
      } catch (replyErr) {
        console.error(`Failed to reply with error to ${tweetId}:`, replyErr.message);
      }
      return;
    }

    // Can't understand the request
    if (!parsed.understood || parsed.participants.length < 2) {
      try {
        await twitterClient.replyToTweet(tweetId, responses.followUpResponse());
      } catch (err) {
        console.error(`Failed to reply with follow-up to ${tweetId}:`, err.message);
      }
      return;
    }

    // Create group
    try {
      const group = await popupClient.createGroup({
        title: parsed.title,
        pairingIdentifiers: parsed.participants,
      });

      console.log(`[bot] Group created:`, JSON.stringify(group));

      const replyText = parsed.response_text
        ? parsed.response_text.replace('%%%', group.inviteUrl)
        : responses.successResponse({ title: parsed.title, inviteUrl: group.inviteUrl });

      await twitterClient.replyToTweet(tweetId, replyText);
    } catch (err) {
      console.error(`Failed to create group for ${tweetId}:`, err.message);
      try {
        await twitterClient.replyToTweet(tweetId, responses.errorResponse());
      } catch (replyErr) {
        console.error(`Failed to reply with error to ${tweetId}:`, replyErr.message);
      }
    }
  }

  async function poll() {
    try {
      const sinceId = store.getSinceId();
      const { tweets, includes, meta } = await twitterClient.getMentions(sinceId);

      if (tweets.length === 0) return;

      console.log(`[bot] Received ${tweets.length} mention(s)`);

      // Process oldest first
      for (const tweet of tweets.reverse()) {
        await processTweet(tweet, includes);
      }

      // Update cursor to newest tweet ID
      if (meta.newest_id) {
        store.setSinceId(meta.newest_id);
      }

      // Reset poll interval on success
      pollInterval = config.pollIntervalMs;
    } catch (err) {
      if (err.code === 429 || err.rateLimit) {
        pollInterval = Math.min(pollInterval * 2, 120_000);
        console.warn(`Rate limited. Backing off to ${pollInterval}ms`);
      } else {
        console.error('Poll error:', err.message);
      }
    }
  }

  function start() {
    console.log(`Bot polling every ${pollInterval}ms as @${botUsername}`);
    poll(); // Initial poll
    pollTimer = setInterval(() => poll(), pollInterval);
    pollTimer.unref();
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  return { start, stop, poll, processTweet };
}
