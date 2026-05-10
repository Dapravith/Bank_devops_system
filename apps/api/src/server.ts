import './observability/bootstrap';
import { buildApp } from './app';
import { env } from './config/env';
import { disconnectDatabase } from './config/database';
import { disconnectRedis } from './config/redis';
import { closeQueues } from './jobs/queue';
import { shutdownTracing } from './observability/tracing';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const app = buildApp();
  const server = app.listen(env.PORT, () => {
    logger.info({
      msg: 'api_started',
      port: env.PORT,
      env: env.NODE_ENV,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ msg: 'shutdown_initiated', signal });
    server.close(async () => {
      try {
        await closeQueues();
        await disconnectRedis();
        await disconnectDatabase();
        await shutdownTracing();
        logger.info({ msg: 'shutdown_complete' });
        process.exit(0);
      } catch (err) {
        logger.error({ msg: 'shutdown_error', err: (err as Error).message });
        process.exit(1);
      }
    });
    setTimeout(() => {
      logger.warn({ msg: 'shutdown_timeout_force_exit' });
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ msg: 'unhandled_rejection', reason: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ msg: 'uncaught_exception', err: err.message, stack: err.stack });
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ msg: 'startup_failed', err: (err as Error).message, stack: (err as Error).stack });
  process.exit(1);
});
