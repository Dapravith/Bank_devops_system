import '../observability/bootstrap';
import http from 'node:http';
import { Job, UnrecoverableError, Worker } from 'bullmq';
import { Prisma, ProcessingStatus } from '@prisma/client';
import { env } from '../config/env';
import { disconnectDatabase } from '../config/database';
import { disconnectRedis, getRedis } from '../config/redis';
import { dlqRepository } from '../repositories/dlq.repository';
import { jobLogRepository } from '../repositories/jobLog.repository';
import { transactionRepository } from '../repositories/transaction.repository';
import { callPartnerApi } from '../services/partnerApi.service';
import { TransactionJobData, closeQueues, pushToDlq } from '../jobs/queue';
import {
  dlqEntriesTotal,
  register,
  transactionJobProcessingDurationSeconds,
  transactionJobsFailedTotal,
  transactionJobsSuccessTotal,
} from '../metrics/registry';
import { shutdownTracing } from '../observability/tracing';
import { logger } from '../utils/logger';

async function processJob(job: Job<TransactionJobData>): Promise<void> {
  const transactionId = job.data.transaction_id;
  const attempt = job.attemptsMade + 1;
  const endTimer = transactionJobProcessingDurationSeconds.startTimer();

  logger.info({
    msg: 'job_started',
    job_id: job.id,
    transaction_id: transactionId,
    attempt,
  });

  const tx = await transactionRepository.findByTransactionId(transactionId);
  if (!tx) {
    logger.error({
      msg: 'transaction_not_found_in_worker',
      job_id: job.id,
      transaction_id: transactionId,
    });
    throw new UnrecoverableError(`Transaction ${transactionId} not found`);
  }

  await transactionRepository.updateProcessingStatus(transactionId, ProcessingStatus.PROCESSING);

  try {
    const partnerResponse = await callPartnerApi(transactionId);

    await transactionRepository.updateProcessingStatus(transactionId, ProcessingStatus.SUCCESS, {
      partner_response: partnerResponse as unknown as Prisma.InputJsonValue,
      error_message: null,
    });

    await jobLogRepository.create({
      transaction_id: transactionId,
      job_id: String(job.id),
      attempt,
      status: 'SUCCESS',
      message: `Partner reference ${partnerResponse.partner_reference}`,
    });

    transactionJobsSuccessTotal.inc();
    endTimer();

    logger.info({
      msg: 'job_succeeded',
      job_id: job.id,
      transaction_id: transactionId,
      attempt,
      processing_status: 'SUCCESS',
    });
  } catch (err) {
    const errorMessage = (err as Error).message;
    const willRetry = attempt < env.JOB_ATTEMPTS;

    await jobLogRepository.create({
      transaction_id: transactionId,
      job_id: String(job.id),
      attempt,
      status: willRetry ? 'RETRY' : 'FAILED',
      message: errorMessage,
    });

    if (willRetry) {
      await transactionRepository.updateProcessingStatus(transactionId, ProcessingStatus.RETRY);
      logger.warn({
        msg: 'job_attempt_failed_will_retry',
        job_id: job.id,
        transaction_id: transactionId,
        attempt,
        error_message: errorMessage,
      });
    } else {
      await transactionRepository.updateProcessingStatus(transactionId, ProcessingStatus.FAILED, {
        error_message: errorMessage,
      });

      // Persist a DLQ entry (DB) AND push to the DLQ stream (Redis) so
      // the admin endpoint can list and requeue, and a separate process
      // could subscribe for alerting.
      await dlqRepository.create({
        transaction_id: transactionId,
        reason: errorMessage,
        attempts: attempt,
        payload: { transaction_id: transactionId } as Prisma.InputJsonValue,
      });
      await pushToDlq({
        transaction_id: transactionId,
        reason: errorMessage,
        attempts: attempt,
      });
      dlqEntriesTotal.inc();

      transactionJobsFailedTotal.inc({ reason: 'max_retries_exceeded' });
      logger.error({
        msg: 'job_failed_terminal',
        job_id: job.id,
        transaction_id: transactionId,
        attempt,
        processing_status: 'FAILED',
        error_message: errorMessage,
      });
    }

    endTimer();
    throw err;
  }
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
    logger.info({ msg: 'worker_metrics_server_started', port });
  });
  return server;
}

async function main(): Promise<void> {
  const connection = getRedis();

  const worker = new Worker<TransactionJobData>(env.QUEUE_NAME, processJob, {
    connection,
    concurrency: 5,
  });

  worker.on('ready', () => logger.info({ msg: 'worker_ready', queue: env.QUEUE_NAME }));
  worker.on('error', (err) => logger.error({ msg: 'worker_error', err: err.message }));
  worker.on('failed', (job, err) => {
    logger.warn({
      msg: 'worker_job_failed_event',
      job_id: job?.id,
      transaction_id: job?.data.transaction_id,
      attempts_made: job?.attemptsMade,
      error_message: err.message,
    });
  });

  const metricsPort = env.PORT + 1;
  const metricsServer = startMetricsServer(metricsPort);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ msg: 'worker_shutdown_initiated', signal });
    try {
      await worker.close();
      metricsServer.close();
      await closeQueues();
      await disconnectRedis();
      await disconnectDatabase();
      await shutdownTracing();
      logger.info({ msg: 'worker_shutdown_complete' });
      process.exit(0);
    } catch (err) {
      logger.error({ msg: 'worker_shutdown_error', err: (err as Error).message });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ msg: 'worker_unhandled_rejection', reason: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ msg: 'worker_uncaught_exception', err: err.message });
    process.exit(1);
  });

  logger.info({ msg: 'worker_started', queue: env.QUEUE_NAME });
}

main().catch((err) => {
  logger.fatal({
    msg: 'worker_startup_failed',
    err: (err as Error).message,
    stack: (err as Error).stack,
  });
  process.exit(1);
});
