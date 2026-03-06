import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createParser } from '../lib/parser.js';

// ── helpers ────────────────────────────────────────────────────

function mockOpenAI(responseJson) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify(responseJson) } }],
        }),
      },
    },
  };
}

function failingOpenAI(error = new Error('API down')) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockRejectedValue(error),
      },
    },
  };
}

function malformedOpenAI(raw) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: raw } }],
        }),
      },
    },
  };
}

// Inject a pre-built OpenAI instance by monkey-patching the module.
// The parser only calls `new OpenAI({ apiKey })` then uses it, so
// we swap the constructor via vi.mock.
let mockClient;
vi.mock('openai', () => ({
  default: class {
    constructor() {
      return mockClient;
    }
  },
}));

function parse(input) {
  const parser = createParser({ apiKey: 'test-key' });
  return parser.parse({
    botUsername: 'ConvosConnect',
    replyChainAuthors: [],
    ...input,
  });
}

// ── test cases ─────────────────────────────────────────────────

describe('parser', () => {
  // ── happy path: clear group chat requests ───────────────────

  describe('clear group chat requests', () => {
    it('two participants, explicit topic', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['alice', 'bob'],
        title: 'Design review',
      });

      const result = await parse({
        tweetText: '@ConvosConnect add @alice and @bob to a chat about design review',
        senderUsername: 'alice',
        mentionedUsernames: ['bob'],
      });

      expect(result).toEqual({
        understood: true,
        participants: ['alice', 'bob'],
        title: 'Design review',
      });
    });

    it('three participants, no explicit topic', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['dave', 'eve', 'frank'],
        title: 'dave, eve & frank',
      });

      const result = await parse({
        tweetText: '@ConvosConnect start a group with @eve @frank',
        senderUsername: 'dave',
        mentionedUsernames: ['eve', 'frank'],
      });

      expect(result).toEqual({
        understood: true,
        participants: ['dave', 'eve', 'frank'],
        title: 'dave, eve & frank',
      });
    });

    it('five participants', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['organizer', 'a', 'b', 'c', 'd'],
        title: 'Sprint planning',
      });

      const result = await parse({
        tweetText: '@ConvosConnect put me @a @b @c @d in a sprint planning chat',
        senderUsername: 'organizer',
        mentionedUsernames: ['a', 'b', 'c', 'd'],
      });

      expect(result.understood).toBe(true);
      expect(result.participants).toHaveLength(5);
      expect(result.participants).toContain('organizer');
    });

    it('with duration', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['alice', 'bob'],
        title: 'Quick sync',
        duration: '30 minutes',
      });

      const result = await parse({
        tweetText: '@ConvosConnect @bob let\'s chat for 30 min about the launch',
        senderUsername: 'alice',
        mentionedUsernames: ['bob'],
      });

      expect(result.duration).toBe('30 minutes');
    });
  });

  // ── phrasing and grammar variations ─────────────────────────

  describe('phrasing variations', () => {
    it('casual, bad grammar', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['tyler', 'jess'],
        title: 'tyler & jess',
      });

      const result = await parse({
        tweetText: '@ConvosConnect yo add me n @jess to a chat lol',
        senderUsername: 'tyler',
        mentionedUsernames: ['jess'],
      });

      expect(result.understood).toBe(true);
      expect(result.participants).toEqual(['tyler', 'jess']);
    });

    it('formal phrasing', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['margaret', 'james'],
        title: 'Q3 budget discussion',
      });

      const result = await parse({
        tweetText: '@ConvosConnect Could you please create a group chat with @james regarding the Q3 budget discussion?',
        senderUsername: 'margaret',
        mentionedUsernames: ['james'],
      });

      expect(result.understood).toBe(true);
      expect(result.title).toBe('Q3 budget discussion');
    });

    it('no "chat" word — just implies grouping', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['sam', 'pat'],
        title: 'sam & pat',
      });

      const result = await parse({
        tweetText: '@ConvosConnect connect me with @pat',
        senderUsername: 'sam',
        mentionedUsernames: ['pat'],
      });

      expect(result.understood).toBe(true);
    });

    it('participants listed before topic', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['kai', 'lee', 'max'],
        title: 'Logo redesign',
      });

      const result = await parse({
        tweetText: '@ConvosConnect @lee @max let\'s talk about the logo redesign',
        senderUsername: 'kai',
        mentionedUsernames: ['lee', 'max'],
      });

      expect(result.understood).toBe(true);
      expect(result.title).toBe('Logo redesign');
    });

    it('topic listed before participants', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['kai', 'lee', 'max'],
        title: 'Logo redesign',
      });

      const result = await parse({
        tweetText: '@ConvosConnect logo redesign chat with @lee @max',
        senderUsername: 'kai',
        mentionedUsernames: ['lee', 'max'],
      });

      expect(result.understood).toBe(true);
      expect(result.participants).toContain('lee');
      expect(result.participants).toContain('max');
    });

    it('all caps', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['yeller', 'target'],
        title: 'URGENT',
      });

      const result = await parse({
        tweetText: '@ConvosConnect ADD @target TO A CHAT NOW THIS IS URGENT',
        senderUsername: 'yeller',
        mentionedUsernames: ['target'],
      });

      expect(result.understood).toBe(true);
    });

    it('emoji-heavy message', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['vibes', 'chill'],
        title: 'Weekend plans',
      });

      const result = await parse({
        tweetText: '@ConvosConnect 🔥🔥 @chill let\'s plan the weekend 🎉🎊',
        senderUsername: 'vibes',
        mentionedUsernames: ['chill'],
      });

      expect(result.understood).toBe(true);
    });
  });

  // ── reply chain context ─────────────────────────────────────

  describe('reply chain context', () => {
    it('includes reply chain authors in context', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['commenter', 'op_author'],
        title: 'Thread discussion',
      });

      const result = await parse({
        tweetText: '@ConvosConnect let\'s take this to a group chat',
        senderUsername: 'commenter',
        mentionedUsernames: [],
        replyChainAuthors: ['op_author'],
      });

      // Verify the prompt sent to OpenAI includes reply chain authors
      const call = mockClient.chat.completions.create.mock.calls[0][0];
      expect(call.messages[1].content).toContain('op_author');
    });
  });

  // ── not understood ──────────────────────────────────────────

  describe('not understood', () => {
    it('just asking what the bot does', async () => {
      mockClient = mockOpenAI({
        understood: false,
        participants: [],
        title: '',
      });

      const result = await parse({
        tweetText: '@ConvosConnect @someone what is this bot?',
        senderUsername: 'curious',
        mentionedUsernames: ['someone'],
      });

      expect(result.understood).toBe(false);
      expect(result.participants).toEqual([]);
    });

    it('unrelated mention', async () => {
      mockClient = mockOpenAI({
        understood: false,
        participants: [],
        title: '',
      });

      const result = await parse({
        tweetText: '@ConvosConnect @friend lol check out this meme',
        senderUsername: 'joker',
        mentionedUsernames: ['friend'],
      });

      expect(result.understood).toBe(false);
    });

    it('complaint or negative feedback', async () => {
      mockClient = mockOpenAI({
        understood: false,
        participants: [],
        title: '',
      });

      const result = await parse({
        tweetText: '@ConvosConnect @support this bot is broken, fix it',
        senderUsername: 'angry',
        mentionedUsernames: ['support'],
      });

      expect(result.understood).toBe(false);
    });

    it('single word', async () => {
      mockClient = mockOpenAI({
        understood: false,
        participants: [],
        title: '',
      });

      const result = await parse({
        tweetText: '@ConvosConnect @someone hi',
        senderUsername: 'brief',
        mentionedUsernames: ['someone'],
      });

      expect(result.understood).toBe(false);
    });

    it('gibberish', async () => {
      mockClient = mockOpenAI({
        understood: false,
        participants: [],
        title: '',
      });

      const result = await parse({
        tweetText: '@ConvosConnect @user asdjkl fhqwhgads',
        senderUsername: 'chaotic',
        mentionedUsernames: ['user'],
      });

      expect(result.understood).toBe(false);
    });
  });

  // ── bot username exclusion ──────────────────────────────────

  describe('bot username handling', () => {
    it('model should never include bot in participants', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['alice', 'bob'],
        title: 'Chat',
      });

      const result = await parse({
        tweetText: '@ConvosConnect @bob start a chat',
        senderUsername: 'alice',
        mentionedUsernames: ['bob'],
      });

      expect(result.participants).not.toContain('ConvosConnect');
      expect(result.participants).not.toContain('convosconnect');
    });
  });

  // ── Zod schema validation ──────────────────────────────────

  describe('zod schema edge cases', () => {
    it('missing participants defaults to empty array', async () => {
      mockClient = mockOpenAI({
        understood: true,
        title: 'Orphan chat',
      });

      const result = await parse({
        tweetText: '@ConvosConnect @user make a chat',
        senderUsername: 'sender',
        mentionedUsernames: ['user'],
      });

      expect(result.participants).toEqual([]);
    });

    it('missing title defaults to empty string', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['a', 'b'],
      });

      const result = await parse({
        tweetText: '@ConvosConnect @b chat',
        senderUsername: 'a',
        mentionedUsernames: ['b'],
      });

      expect(result.title).toBe('');
    });

    it('extra fields are stripped by zod', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['a', 'b'],
        title: 'Test',
        mood: 'excited',
        confidence: 0.99,
      });

      const result = await parse({
        tweetText: '@ConvosConnect @b chat',
        senderUsername: 'a',
        mentionedUsernames: ['b'],
      });

      expect(result).not.toHaveProperty('mood');
      expect(result).not.toHaveProperty('confidence');
    });

    it('duration is optional and omitted when absent', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['a', 'b'],
        title: 'Test',
      });

      const result = await parse({
        tweetText: '@ConvosConnect @b chat',
        senderUsername: 'a',
        mentionedUsernames: ['b'],
      });

      expect(result.duration).toBeUndefined();
    });
  });

  // ── error handling ──────────────────────────────────────────

  describe('error handling', () => {
    it('API failure returns safe fallback', async () => {
      mockClient = failingOpenAI();

      const result = await parse({
        tweetText: '@ConvosConnect @bob chat',
        senderUsername: 'alice',
        mentionedUsernames: ['bob'],
      });

      expect(result).toEqual({ understood: false, participants: [], title: '' });
    });

    it('invalid JSON from model returns safe fallback', async () => {
      mockClient = malformedOpenAI('this is not json at all');

      const result = await parse({
        tweetText: '@ConvosConnect @bob chat',
        senderUsername: 'alice',
        mentionedUsernames: ['bob'],
      });

      expect(result).toEqual({ understood: false, participants: [], title: '' });
    });

    it('empty response from model returns safe fallback', async () => {
      mockClient = malformedOpenAI('');

      const result = await parse({
        tweetText: '@ConvosConnect @bob chat',
        senderUsername: 'alice',
        mentionedUsernames: ['bob'],
      });

      expect(result).toEqual({ understood: false, participants: [], title: '' });
    });

    it('wrong types from model returns safe fallback', async () => {
      mockClient = malformedOpenAI(JSON.stringify({
        understood: 'yes',
        participants: 'alice, bob',
        title: 42,
      }));

      const result = await parse({
        tweetText: '@ConvosConnect @bob chat',
        senderUsername: 'alice',
        mentionedUsernames: ['bob'],
      });

      expect(result).toEqual({ understood: false, participants: [], title: '' });
    });
  });

  // ── prompt construction ─────────────────────────────────────

  describe('prompt construction', () => {
    it('sends correct system prompt and user context', async () => {
      mockClient = mockOpenAI({
        understood: true,
        participants: ['alice', 'bob'],
        title: 'Test',
      });

      await parse({
        tweetText: '@ConvosConnect @bob let\'s chat',
        senderUsername: 'alice',
        mentionedUsernames: ['bob'],
        replyChainAuthors: ['carol'],
      });

      const call = mockClient.chat.completions.create.mock.calls[0][0];
      expect(call.model).toBe('gpt-5-nano');
      expect(call.temperature).toBe(0);
      expect(call.response_format).toEqual({ type: 'json_object' });

      const systemMsg = call.messages[0].content;
      expect(systemMsg).toContain('Do NOT include the bot\'s username in participants');
      expect(systemMsg).toContain('Always include the sender in participants');

      const userMsg = call.messages[1].content;
      expect(userMsg).toContain('@ConvosConnect @bob let\'s chat');
      expect(userMsg).toContain('Sender: alice');
      expect(userMsg).toContain('bob');
      expect(userMsg).toContain('carol');
      expect(userMsg).toContain('Bot username: ConvosConnect');
    });

    it('shows "none" when no mentioned users', async () => {
      mockClient = mockOpenAI({ understood: false, participants: [], title: '' });

      await parse({
        tweetText: '@ConvosConnect hello',
        senderUsername: 'alice',
        mentionedUsernames: [],
      });

      const userMsg = mockClient.chat.completions.create.mock.calls[0][0].messages[1].content;
      expect(userMsg).toContain('Mentioned users (excluding bot): none');
    });

    it('shows "none" when no reply chain authors', async () => {
      mockClient = mockOpenAI({ understood: false, participants: [], title: '' });

      await parse({
        tweetText: '@ConvosConnect @bob hi',
        senderUsername: 'alice',
        mentionedUsernames: ['bob'],
        replyChainAuthors: [],
      });

      const userMsg = mockClient.chat.completions.create.mock.calls[0][0].messages[1].content;
      expect(userMsg).toContain('Reply chain authors: none');
    });
  });
});
