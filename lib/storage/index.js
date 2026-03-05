import { MemoryStorage } from './MemoryStorage.js';

export { StorageInterface } from './StorageInterface.js';
export { MemoryStorage } from './MemoryStorage.js';
export { RedisStorage } from './RedisStorage.js';

export async function createStorage(config, logger) {
  if (config.redisUrl) {
    const { default: Redis } = await import('ioredis');
    const { RedisStorage } = await import('./RedisStorage.js');
    const redis = new Redis(config.redisUrl);
    if (logger) logger.info('Using RedisStorage');
    return new RedisStorage(redis);
  }
  if (logger) logger.info('Using MemoryStorage (no REDIS_URL set)');
  return new MemoryStorage();
}
