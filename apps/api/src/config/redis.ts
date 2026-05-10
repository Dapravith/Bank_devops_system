import IORedis, { Redis } from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export function createRedisConnection(): Redis {
  const conn = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  conn.on('error', (err) => {
    logger.error({ msg: 'redis connection error', err: err.message });
  });

  conn.on('ready', () => {
    logger.info({ msg: 'redis connection ready' });
  });

  return conn;
}

let sharedConnection: Redis | undefined;

export function getRedis(): Redis {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection();
  }
  return sharedConnection;
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const conn = getRedis();
    const reply = await conn.ping();
    return reply === 'PONG';
  } catch (err) {
    logger.error({ msg: 'redis health check failed', err: (err as Error).message });
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = undefined;
  }
}
