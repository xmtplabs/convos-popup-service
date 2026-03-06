const MAX_PROCESSED_TWEETS = 10_000;
const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function createStore() {
  const processedTweets = new Set();
  const oauthSessions = new Map();
  let sinceId = null;

  function markProcessed(tweetId) {
    processedTweets.add(tweetId);
    // Evict oldest entries when set grows too large
    if (processedTweets.size > MAX_PROCESSED_TWEETS) {
      const it = processedTweets.values();
      for (let i = 0; i < processedTweets.size - MAX_PROCESSED_TWEETS; i++) {
        processedTweets.delete(it.next().value);
      }
    }
  }

  function isProcessed(tweetId) {
    return processedTweets.has(tweetId);
  }

  function saveOAuthSession(state, session) {
    oauthSessions.set(state, { ...session, createdAt: Date.now() });
  }

  function getOAuthSession(state) {
    const session = oauthSessions.get(state);
    if (!session) return null;
    if (Date.now() - session.createdAt > OAUTH_SESSION_TTL_MS) {
      oauthSessions.delete(state);
      return null;
    }
    return session;
  }

  function deleteOAuthSession(state) {
    oauthSessions.delete(state);
  }

  function getSinceId() {
    return sinceId;
  }

  function setSinceId(id) {
    sinceId = id;
  }

  function cleanup() {
    const now = Date.now();
    for (const [state, session] of oauthSessions) {
      if (now - session.createdAt > OAUTH_SESSION_TTL_MS) {
        oauthSessions.delete(state);
      }
    }
  }

  // Run cleanup every 5 minutes
  const cleanupInterval = setInterval(cleanup, 5 * 60 * 1000);
  cleanupInterval.unref();

  return {
    markProcessed,
    isProcessed,
    saveOAuthSession,
    getOAuthSession,
    deleteOAuthSession,
    getSinceId,
    setSinceId,
    cleanup,
  };
}
