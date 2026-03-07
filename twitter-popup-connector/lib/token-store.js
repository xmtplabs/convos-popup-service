import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.join(__dirname, '..', 'data', 'bot-token.json');
const REDIS_KEY = 'popup:bot-oauth-token';

export async function createTokenStore({ redisUrl, filePath = DEFAULT_PATH } = {}) {
  if (redisUrl) {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(redisUrl);
    console.log('Token store: using Redis');
    return {
      async load() {
        const raw = await redis.get(REDIS_KEY);
        return raw ? JSON.parse(raw) : null;
      },
      async save(tokenData) {
        await redis.set(REDIS_KEY, JSON.stringify(tokenData));
      },
    };
  }

  console.log('Token store: using file');
  return {
    async load() {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async save(tokenData) {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(tokenData, null, 2) + '\n');
    },
  };
}
