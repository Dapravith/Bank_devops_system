import '../observability/bootstrap';
import http from 'node:http';
import { env } from '../config/env';
import { disconnectDatabase } from '../config/database';
import { disconnectRedis } from '../config/redis';
import { outboxRepository } from '../repositories/outbox.repository';
import { closeQueues, enqueueTransactionJob } from '../jobs/queue';
import {
  outboxDispatchedTotal,
  outboxDispatchFailedTotal,
  outboxLagSeconds,
  outboxPendingGauge,
  register,
} from '../metrics/registry';
import { shutdownTracing } from '../observability/tracing';
import { logger } from '../utils/logger';

interface OutboxPayload {
  transaction_id: string;
}

let stopped = false;

async function dispatchOnce(): Promise<number> {
  const events = await outboxRepository.claimPending(env.OUTBOX_BATCH_SIZE);
  if (events.length === 0) {
    outboxLagSeconds.set(0);
    return 0;
  }

  const oldest = events[events.length - 1];
  outboxLagSeconds.set((Date.now() - oldest.created_at.getTime()) / 1000);

  let dispatched = 0;
  for (const event of events) {
    const payload = event.payload as unknown as OutboxPayload;
    try {
      await enqueueTransactionJob(payload.transaction_id);
      outboxDispatchedTotal.inc({ event_type: event.event_type });
      dispatched++;
      logger.info({
        msg: 'outbox_event_dispatched',
        outbox_id: event.id,
        event_type: event.event_type,
        transaction_id: payload.transaction_id,
        attempts: event.attempts,
      });
    } catch (err) {
      const message = (err as Error).message;
      outboxDispatchFailedTotal.inc({ event_type: event.event_type });
      // Re-mark as PENDING so the next tick will retry. The row was already
      // moved to DISPATCHED by claimPending; revert + record the error.
      await outboxRepository.markFailed(event.id, message);
      logger.error({
        msg: 'outbox_event_dispatch_failed',
        outbox_id: event.id,
        event_type: event.event_type,
        transaction_id: payload.transaction_id,
        error_message: message,
      });
    }
  }
  return dispatched;
}

function startMetricsServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.url === '/metrics') {
      register
        .metrics()
        .then((m) => {
          res.writeHead(200, { 'Content-Type': register.contentType });
          res.end(m);
        })
        .catch(() => {
          res.writeHead(500);
          res.end();
        });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, () => {
    logger.info({ msg: 'outbox_dispatcher_metrics_server_started', port });
  });
  return server;
}

async function loop(): Promise<void> {
  while (!stopped) {
    try {
      const n = await dispatchOnce();
      const pending = await outboxRepository.countPending();
      outboxPendingGauge.set(pending);
      if (n === 0) {
        await new Promise((r) => setTimeout(r, env.OUTBOX_POLL_INTERVAL_MS));
      }
    } catch (err) {
      logger.error({ msg: 'outbox_loop_error', error_message: (err as Error).message });
      await new Promise((r) => setTimeout(r, env.OUTBOX_POLL_INTERVAL_MS));
    }
  }
}

async function main(): Promise<void> {
  const metricsPort = env.PORT + 2;
  const metricsServer = startMetricsServer(metricsPort);

  logger.info({
    msg: 'outbox_dispatcher_started',
    poll_interval_ms: env.OUTBOX_POLL_INTERVAL_MS,
    batch_size: env.OUTBOX_BATCH_SIZE,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ msg: 'outbox_shutdown_initiated', signal });
    stopped = true;
    try {
      metricsServer.close();
      await closeQueues();
      await disconnectRedis();
      await disconnectDatabase();
      await shutdownTracing();
      logger.info({ msg: 'outbox_shutdown_complete' });
      process.exit(0);
    } catch (err) {
      logger.error({ msg: 'outbox_shutdown_error', err: (err as Error).message });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await loop();
}

main().catch((err) => {
  logger.fatal({
    msg: 'outbox_dispatcher_startup_failed',
    err: (err as Error).message,
    stack: (err as Error).stack,
  });
  process.exit(1);
});
