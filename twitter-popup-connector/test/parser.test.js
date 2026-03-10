import { describe, it, expect, beforeAll } from 'vitest';
import { createParser } from '../lib/parser.js';

let parser;

beforeAll(() => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith('<')) {
    throw new Error('OPENAI_API_KEY must be set in root .env to run parser tests');
  }
  parser = createParser({ apiKey });
});

function parse(input) {
  return parser.parse({
    botUsername: 'ConvosConnect',
    replyChainAuthors: [],
    ...input,
  });
}

// ── happy path: clear group chat requests ─────────────────────

describe('clear group chat requests', () => {
  it('two participants, explicit topic', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect add @alice and @bob to a chat about design review',
      senderUsername: 'alice',
      mentionedUsernames: ['bob'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('alice');
    expect(result.participants).toContain('bob');
    expect(result.participants).not.toContain('ConvosConnect');
    expect(result.title).toBeTruthy();
    expect(result.title.length).toBeLessThanOrEqual(50);
  });

  it('three participants, no explicit topic', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect start a group with @eve @frank',
      senderUsername: 'dave',
      mentionedUsernames: ['eve', 'frank'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('dave');
    expect(result.participants).toContain('eve');
    expect(result.participants).toContain('frank');
    expect(result.participants).toHaveLength(3);
    expect(result.title).toBeTruthy();
  });

  it('five participants', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect put me @a @b @c @d in a sprint planning chat',
      senderUsername: 'organizer',
      mentionedUsernames: ['a', 'b', 'c', 'd'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('organizer');
    expect(result.participants.length).toBeGreaterThanOrEqual(5);
  });

  it('with duration', async () => {
    const result = await parse({
      tweetText: "@ConvosConnect @bob let's chat for 30 min about the launch",
      senderUsername: 'alice',
      mentionedUsernames: ['bob'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('alice');
    expect(result.participants).toContain('bob');
    expect(result.duration).toBeTruthy();
  });
});

// ── phrasing and grammar variations ───────────────────────────

describe('phrasing variations', () => {
  it('casual, bad grammar', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect yo add me n @jess to a chat lol',
      senderUsername: 'tyler',
      mentionedUsernames: ['jess'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('tyler');
    expect(result.participants).toContain('jess');
  });

  it('formal phrasing', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect Could you please create a group chat with @james regarding the Q3 budget discussion?',
      senderUsername: 'margaret',
      mentionedUsernames: ['james'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('margaret');
    expect(result.participants).toContain('james');
    expect(result.title.toLowerCase()).toMatch(/budget|q3/);
  });

  it('no "chat" word — just implies grouping', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect connect me with @pat',
      senderUsername: 'sam',
      mentionedUsernames: ['pat'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('sam');
    expect(result.participants).toContain('pat');
  });

  it('participants listed before topic', async () => {
    const result = await parse({
      tweetText: "@ConvosConnect @lee @max let's talk about the logo redesign",
      senderUsername: 'kai',
      mentionedUsernames: ['lee', 'max'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('kai');
    expect(result.participants).toContain('lee');
    expect(result.participants).toContain('max');
    expect(result.title.toLowerCase()).toMatch(/logo|redesign/);
  });

  it('topic listed before participants', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect logo redesign chat with @lee @max',
      senderUsername: 'kai',
      mentionedUsernames: ['lee', 'max'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('lee');
    expect(result.participants).toContain('max');
    expect(result.participants).toContain('kai');
  });

  it('all caps', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect ADD @target TO A CHAT NOW THIS IS URGENT',
      senderUsername: 'yeller',
      mentionedUsernames: ['target'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('yeller');
    expect(result.participants).toContain('target');
  });

  it('emoji-heavy message', async () => {
    const result = await parse({
      tweetText: "@ConvosConnect 🔥🔥 @chill let's plan the weekend 🎉🎊",
      senderUsername: 'vibes',
      mentionedUsernames: ['chill'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('vibes');
    expect(result.participants).toContain('chill');
  });

  it('typos and misspellings', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @dana plz mak a grp chat abt teh product lanch',
      senderUsername: 'sloppy',
      mentionedUsernames: ['dana'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('sloppy');
    expect(result.participants).toContain('dana');
  });

  it('minimal — just usernames, no verb or description', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @bob @carol group chat',
      senderUsername: 'alice',
      mentionedUsernames: ['bob', 'carol'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('alice');
    expect(result.participants).toContain('bob');
    expect(result.participants).toContain('carol');
  });
});

// ── reply chain context ───────────────────────────────────────

describe('reply chain context', () => {
  it('picks up reply chain authors as potential participants', async () => {
    const result = await parse({
      tweetText: "@ConvosConnect let's take this to a group chat",
      senderUsername: 'commenter',
      mentionedUsernames: ['thread_op'],
      replyChainAuthors: ['thread_op'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('commenter');
  });
});

// ── not understood ────────────────────────────────────────────

describe('not understood', () => {
  it('just asking what the bot does', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @someone what is this bot? how does it work?',
      senderUsername: 'curious',
      mentionedUsernames: ['someone'],
    });

    expect(result.understood).toBe(false);
  });

  it('unrelated mention — sharing a meme', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @friend lol check out this meme, so funny',
      senderUsername: 'joker',
      mentionedUsernames: ['friend'],
    });

    expect(result.understood).toBe(false);
  });

  it('complaint or negative feedback', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @support this bot is broken, nothing works, fix it',
      senderUsername: 'angry',
      mentionedUsernames: ['support'],
    });

    expect(result.understood).toBe(false);
  });

  it('just saying hi', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @someone hi',
      senderUsername: 'brief',
      mentionedUsernames: ['someone'],
    });

    expect(result.understood).toBe(false);
  });

  it('gibberish', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @user asdjkl fhqwhgads blerp',
      senderUsername: 'chaotic',
      mentionedUsernames: ['user'],
    });

    expect(result.understood).toBe(false);
  });

  it('asking a question to another user', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @expert hey what do you think about the new iPhone?',
      senderUsername: 'asker',
      mentionedUsernames: ['expert'],
    });

    expect(result.understood).toBe(false);
  });

  it('promoting something', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @everyone check out my new NFT collection dropping tomorrow!!!',
      senderUsername: 'spammer',
      mentionedUsernames: ['everyone'],
    });

    expect(result.understood).toBe(false);
  });
});

// ── bot username exclusion ────────────────────────────────────

describe('bot username handling', () => {
  it('never includes bot in participants', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @bob start a chat please',
      senderUsername: 'alice',
      mentionedUsernames: ['bob'],
    });

    expect(result.understood).toBe(true);
    const lower = result.participants.map((p) => p.toLowerCase());
    expect(lower).not.toContain('convosconnect');
  });
});

// ── structural validation ─────────────────────────────────────

describe('output structure', () => {
  it('always returns understood as a boolean', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @bob chat',
      senderUsername: 'alice',
      mentionedUsernames: ['bob'],
    });

    expect(typeof result.understood).toBe('boolean');
  });

  it('participants is always an array of strings', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @bob @carol start a group chat about the project',
      senderUsername: 'alice',
      mentionedUsernames: ['bob', 'carol'],
    });

    expect(Array.isArray(result.participants)).toBe(true);
    for (const p of result.participants) {
      expect(typeof p).toBe('string');
    }
  });

  it('title is always a string', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @bob chat about shipping deadlines',
      senderUsername: 'alice',
      mentionedUsernames: ['bob'],
    });

    expect(typeof result.title).toBe('string');
  });

  it('title is under 50 characters', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @bob let\'s discuss the extremely complicated and multifaceted situation regarding our international supply chain logistics and distribution network optimization strategy',
      senderUsername: 'alice',
      mentionedUsernames: ['bob'],
    });

    expect(result.title.length).toBeLessThanOrEqual(50);
  });

  it('duration is a number or undefined', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @bob quick 15 min chat',
      senderUsername: 'alice',
      mentionedUsernames: ['bob'],
    });

    if (result.duration !== undefined) {
      expect(typeof result.duration).toBe('number');
    }
  });
});

// ── sender always included ────────────────────────────────────

describe('sender inclusion', () => {
  it('sender is in participants even when not self-mentioning', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect get @bob and @carol into a chat',
      senderUsername: 'alice',
      mentionedUsernames: ['bob', 'carol'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('alice');
  });

  it('sender with underscore username', async () => {
    const result = await parse({
      tweetText: '@ConvosConnect @cool_dev let\'s pair on this bug',
      senderUsername: 'my_user_123',
      mentionedUsernames: ['cool_dev'],
    });

    expect(result.understood).toBe(true);
    expect(result.participants).toContain('my_user_123');
  });
});
