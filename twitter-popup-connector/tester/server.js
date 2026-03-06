import express from 'express';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const PORT = parseInt(process.env.TESTER_PORT || '4200', 10);
const BOT_USERNAME = process.env.TWITTER_BOT_USERNAME || 'ConvosConnect';
const BOT_ID = 'bot-1';

// --- In-memory state ---

let nextId = 1;
const tweets = [];
const users = new Map([[BOT_ID, BOT_USERNAME]]);

function ensureUser(username) {
  for (const [id, name] of users) {
    if (name.toLowerCase() === username.toLowerCase()) return id;
  }
  const id = `user-${nextId++}`;
  users.set(id, username);
  return id;
}

function makeTweet({ text, authorId, replyToId }) {
  const id = String(nextId++);
  const username = users.get(authorId);

  // Parse @mentions from text
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push({ start: match.index, end: match.index + match[0].length, username: match[1] });
  }

  const tweet = {
    id,
    text,
    author_id: authorId,
    created_at: new Date().toISOString(),
    entities: mentions.length > 0 ? { mentions } : {},
    referenced_tweets: replyToId ? [{ type: 'replied_to', id: replyToId }] : [],
  };

  tweets.push(tweet);
  return tweet;
}

function usersForTweets(tweetList) {
  const seen = new Set();
  const result = [];
  for (const t of tweetList) {
    if (!seen.has(t.author_id)) {
      seen.add(t.author_id);
      result.push({ id: t.author_id, username: users.get(t.author_id) });
    }
  }
  return result;
}

// --- Fake Twitter API v2 ---

// GET /2/users/me
app.get('/2/users/me', (req, res) => {
  const auth = req.headers.authorization || '';
  // If bearer token encodes a username (from OAuth flow), return that user
  if (auth.startsWith('Bearer fake-token-')) {
    const username = auth.slice('Bearer fake-token-'.length);
    const userId = ensureUser(username);
    return res.json({ data: { id: userId, username } });
  }
  // Otherwise return the bot
  res.json({ data: { id: BOT_ID, username: BOT_USERNAME } });
});

// GET /2/users/:id/mentions
app.get('/2/users/:id/mentions', (req, res) => {
  const sinceId = req.query.since_id || null;
  const botMention = `@${BOT_USERNAME}`.toLowerCase();

  let matching = tweets.filter((t) => {
    if (t.author_id === BOT_ID) return false;
    return t.text.toLowerCase().includes(botMention);
  });

  if (sinceId) {
    matching = matching.filter((t) => Number(t.id) > Number(sinceId));
  }

  if (matching.length === 0) {
    return res.json({ data: [], includes: { users: [] }, meta: {} });
  }

  const newestId = matching.reduce((max, t) => (Number(t.id) > Number(max) ? t.id : max), matching[0].id);

  res.json({
    data: matching,
    includes: { users: usersForTweets(matching) },
    meta: { newest_id: newestId, result_count: matching.length },
  });
});

// GET /2/tweets/:id
app.get('/2/tweets/:id', (req, res) => {
  const tweet = tweets.find((t) => t.id === req.params.id);
  if (!tweet) return res.status(404).json({ errors: [{ detail: 'Tweet not found' }] });
  res.json({
    data: tweet,
    includes: { users: [{ id: tweet.author_id, username: users.get(tweet.author_id) }] },
  });
});

// POST /2/tweets (bot replies)
app.post('/2/tweets', (req, res) => {
  const { text, reply } = req.body;
  const tweet = makeTweet({
    text,
    authorId: BOT_ID,
    replyToId: reply?.in_reply_to_tweet_id || null,
  });
  res.json({ data: { id: tweet.id, text: tweet.text } });
});

// --- Fake OAuth ---

// GET /oauth2/authorize — render a simple form
app.get('/oauth2/authorize', (req, res) => {
  const { redirect_uri, state } = req.query;
  res.type('html').send(`<!DOCTYPE html>
<html><head><title>Fake Twitter Auth</title>
<style>
  body { font-family: system-ui; max-width: 400px; margin: 60px auto; }
  input, button { font-size: 16px; padding: 8px 12px; }
  input[type=text] { width: 100%; box-sizing: border-box; margin: 8px 0 16px; }
  button { background: #1d9bf0; color: white; border: none; border-radius: 20px; cursor: pointer; }
</style></head><body>
<h2>Fake Twitter Authorization</h2>
<p>Enter the username you want to authorize as:</p>
<form method="POST" action="/oauth2/authorize">
  <input type="hidden" name="redirect_uri" value="${redirect_uri || ''}">
  <input type="hidden" name="state" value="${state || ''}">
  <input type="text" name="username" placeholder="testuser" required>
  <button type="submit">Authorize</button>
</form>
</body></html>`);
});

// POST /oauth2/authorize — redirect with fake code
app.post('/oauth2/authorize', (req, res) => {
  const { redirect_uri, state, username } = req.body;
  const code = `fakecode-${username}`;
  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

// POST /2/oauth2/token
app.post('/2/oauth2/token', (req, res) => {
  // code is in the URL-encoded body
  const code = req.body.code || '';
  const username = code.startsWith('fakecode-') ? code.slice('fakecode-'.length) : 'testuser';
  res.json({
    access_token: `fake-token-${username}`,
    token_type: 'bearer',
    expires_in: 7200,
  });
});

// --- Web UI ---

// GET /tweets.json — JSON feed for polling
app.get('/tweets.json', (_req, res) => {
  const data = tweets.map((t) => ({
    id: t.id,
    text: t.text,
    username: users.get(t.author_id) || '???',
    isBot: t.author_id === BOT_ID,
    replyToId: t.referenced_tweets?.find((r) => r.type === 'replied_to')?.id || null,
  }));
  res.json(data);
});

// GET / — thread view
app.get('/', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html><head><title>Twitter Tester</title>
<style>
  body { font-family: system-ui; max-width: 600px; margin: 20px auto; padding: 0 16px; }
  h2 { margin-bottom: 4px; }
  .subtitle { color: #666; margin-top: 0; }
  form { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  input[type=text] { padding: 8px; font-size: 14px; border: 1px solid #ccc; border-radius: 6px; }
  input[name=username] { width: 120px; }
  input[name=text] { flex: 1; min-width: 200px; }
  button { padding: 8px 16px; background: #1d9bf0; color: white; border: none; border-radius: 20px; cursor: pointer; font-size: 14px; }
  .tweet { padding: 8px 12px; margin: 4px 0; border-radius: 8px; }
  .tweet-user { background: #f5f5f5; }
  .tweet-bot { background: #e8f5e9; }
  .tweet-bot strong { color: #1b8d3e; }
  .reply-note { color: #666; }
  .tweet-id { color: #999; font-size: 0.85em; }
  .empty { color: #999; }
  a { color: #1d9bf0; }
</style></head><body>
<h2>Twitter Tester</h2>
<p class="subtitle">Bot: @${escapeHtml(BOT_USERNAME)} &mdash; <span id="count">0</span> tweet(s)</p>
<div id="thread"><p class="empty">No tweets yet. Post one below!</p></div>
<form id="tweet-form">
  <input type="text" name="username" placeholder="username" value="testuser" required>
  <input type="text" name="text" placeholder="@${escapeHtml(BOT_USERNAME)} add @alice and @bob to a chat about ..." required>
  <button type="submit">Tweet</button>
</form>
<script>
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
  function linkify(s) {
    return esc(s).replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$$1" target="_blank">$$1</a>');
  }
  function renderTweets(tweets) {
    document.getElementById('count').textContent = tweets.length;
    if (tweets.length === 0) {
      document.getElementById('thread').innerHTML = '<p class="empty">No tweets yet. Post one below!</p>';
      return;
    }
    document.getElementById('thread').innerHTML = tweets.map(function(t) {
      var cls = t.isBot ? 'tweet tweet-bot' : 'tweet tweet-user';
      var reply = t.replyToId ? ' <span class="reply-note">replying to #' + esc(t.replyToId) + '</span>' : '';
      return '<div class="' + cls + '">' +
        '<strong>@' + esc(t.username) + '</strong>' + reply +
        ' <span class="tweet-id">#' + esc(t.id) + '</span><br>' +
        '<span>' + linkify(t.text) + '</span></div>';
    }).join('');
  }
  function poll() {
    fetch('/tweets.json').then(function(r) { return r.json(); }).then(renderTweets).catch(function(){});
  }
  poll();
  setInterval(poll, 2000);

  document.getElementById('tweet-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var form = e.target;
    var body = new URLSearchParams(new FormData(form));
    fetch('/tweet', { method: 'POST', body: body }).then(function() {
      form.elements.text.value = '';
      poll();
    });
  });
</script>
</body></html>`);
});

// POST /tweet — user posts a tweet from the web UI
app.post('/tweet', (req, res) => {
  const { username, text } = req.body;
  if (!username || !text) return res.status(400).json({ error: 'missing fields' });
  const authorId = ensureUser(username.replace(/^@/, ''));
  const tweet = makeTweet({ text, authorId, replyToId: null });
  res.json({ ok: true, id: tweet.id });
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Start ---

app.listen(PORT, () => {
  console.log(`Twitter tester running at http://localhost:${PORT}`);
  console.log(`Bot identity: @${BOT_USERNAME} (id: ${BOT_ID})`);
});
