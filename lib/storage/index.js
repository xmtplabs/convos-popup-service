import { MemoryStorage } from './memory-storage.js';

export { StorageInterface } from './storage-interface.js';
export { MemoryStorage } from './memory-storage.js';
export { RedisStorage } from './redis-storage.js';

export async function createStorage(config, logger) {
  if (config.redisUrl) {
    const { default: Redis } = await import('ioredis');
    const { RedisStorage } = await import('./redis-storage.js');
    const redis = new Redis(config.redisUrl);
    if (logger) logger.info('Using RedisStorage');
    return new RedisStorage(redis);
  }
  if (logger) logger.info('Using MemoryStorage (no REDIS_URL set)');
  return new MemoryStorage();
}
