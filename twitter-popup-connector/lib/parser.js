import OpenAI from 'openai';
import { z } from 'zod';

const ParseResultSchema = z.object({
  understood: z.boolean(),
  participants: z.array(z.string()).default([]),
  title: z.string().default(''),
  duration: z.string().optional(),
  response_text: z.string().optional(),
});

const SYSTEM_PROMPT = `You are a tweet parser for a group chat bot. Given a tweet and context about who is mentioned, extract the user's intent.

Return JSON with these fields:
- "understood" (boolean): true if the user wants to create a group chat
- "participants" (string[]): X usernames (without @) of people to include in the chat. Always include the sender. Never include the bot itself, @ConvosConnect
- "title" (string): a short title for the group chat based on any topic mentioned. If no topic, generate something brief based on the participants.
- "duration" (number, optional): if the user mentions a time limit, include it and convert it to be in minute units (e.g. "30 minutes", "1 hour")
- "response_text" (string): A response to the user telling them that their group is ready, not too formal, not too silly, just confident and fun. Include %%% somewhere in the string, where appropriate, to replace with a link.

Rules:
- Do NOT include the bot's username in participants
- Always include the sender in participants
- If the tweet is just asking what you do, or is not about creating a group chat, set understood to false
- Keep titles concise (under 50 characters)`;

export function createParser({ apiKey }) {
  const openai = new OpenAI({ apiKey });

  async function parse({ tweetText, senderUsername, mentionedUsernames, botUsername, replyChainAuthors }) {
    const userPrompt = `Tweet: "${tweetText}"

Sender: ${senderUsername}
Mentioned users (excluding bot): ${mentionedUsernames.join(', ') || 'none'}
Reply chain authors: ${replyChainAuthors.join(', ') || 'none'}
Bot username: ${botUsername}

Extract the group chat request from this tweet.`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    console.log('[parser] OpenAI request:', JSON.stringify({ model: 'gpt-5-nano', messages }, null, 2));

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-5-nano',
        response_format: { type: 'json_object' },
        messages,
      });

      const rawContent = response.choices[0].message.content;
      console.log('[parser] OpenAI raw response:', rawContent);

      const raw = JSON.parse(rawContent);
      const parsed = ParseResultSchema.parse(raw);
      console.log('[parser] Parsed result:', JSON.stringify(parsed));
      return parsed;
    } catch (err) {
      console.error('[parser] OpenAI error:', err.message);
      return { understood: false, participants: [], title: '' };
    }
  }

  return { parse };
}
