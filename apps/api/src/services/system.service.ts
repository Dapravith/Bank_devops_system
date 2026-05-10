import { checkDatabaseHealth } from '../config/database';
import { checkRedisHealth } from '../config/redis';
import { getTransactionQueue } from '../jobs/queue';
import { databaseHealthStatus, redisHealthStatus } from '../metrics/registry';
import { logger } from '../utils/logger';
import { SystemStatusResponseData } from '../types/api';

async function getQueueCounts(): Promise<SystemStatusResponseData['queue']> {
  try {
    const q = getTransactionQueue();
    const counts = await q.getJobCounts('wait', 'active', 'delayed', 'failed');
    return {
      wait: counts.wait ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    };
  } catch (err) {
    logger.warn({ msg: 'queue_counts_unavailable', err: (err as Error).message });
    return { wait: 0, active: 0, delayed: 0, failed: 0 };
  }
}

export const systemService = {
  async status(): Promise<SystemStatusResponseData> {
    const [dbOk, redisOk, queue] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      getQueueCounts(),
    ]);
    databaseHealthStatus.set(dbOk ? 1 : 0);
    redisHealthStatus.set(redisOk ? 1 : 0);
    return {
      api: {
        status: 'ok',
        uptime_seconds: Math.round(process.uptime()),
      },
      database: { status: dbOk ? 'ok' : 'fail' },
      redis: { status: redisOk ? 'ok' : 'fail' },
      queue,
    };
  },
};
