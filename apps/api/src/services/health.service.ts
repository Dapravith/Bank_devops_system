import { checkDatabaseHealth } from '../config/database';
import { checkRedisHealth } from '../config/redis';
import { databaseHealthStatus, redisHealthStatus } from '../metrics/registry';

export interface ReadinessResult {
  ready: boolean;
  checks: {
    database: 'ok' | 'fail';
    redis: 'ok' | 'fail';
  };
}

export async function getReadiness(): Promise<ReadinessResult> {
  const [dbOk, redisOk] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);
  databaseHealthStatus.set(dbOk ? 1 : 0);
  redisHealthStatus.set(redisOk ? 1 : 0);
  return {
    ready: dbOk && redisOk,
    checks: {
      database: dbOk ? 'ok' : 'fail',
      redis: redisOk ? 'ok' : 'fail',
    },
  };
}
