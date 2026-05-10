import { Queue, QueueEvents } from 'bullmq';
import { env } from '../config/env';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

export interface TransactionJobData {
  transaction_id: string;
}

export interface DlqJobData {
  transaction_id: string;
  reason: string;
  attempts: number;
}

let mainQueue: Queue<TransactionJobData> | undefined;
let dlqQueue: Queue<DlqJobData> | undefined;

export function getTransactionQueue(): Queue<TransactionJobData> {
  if (!mainQueue) {
    mainQueue = new Queue<TransactionJobData>(env.QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: env.JOB_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: env.JOB_BACKOFF_DELAY_MS,
        },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600, count: 5000 },
      },
    });
  }
  return mainQueue;
}

export function getDlqQueue(): Queue<DlqJobData> {
  if (!dlqQueue) {
    dlqQueue = new Queue<DlqJobData>(env.DLQ_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 7 * 24 * 3600, count: 10_000 },
        removeOnFail: false,
      },
    });
  }
  return dlqQueue;
}

export async function enqueueTransactionJob(transactionId: string): Promise<string> {
  const q = getTransactionQueue();
  const job = await q.add(
    'process-transaction',
    { transaction_id: transactionId },
    { jobId: `tx:${transactionId}:${Date.now()}` },
  );
  logger.info({
    msg: 'job_enqueued',
    transaction_id: transactionId,
    job_id: job.id,
    queue: env.QUEUE_NAME,
  });
  return job.id ?? `tx:${transactionId}`;
}

export async function pushToDlq(input: DlqJobData): Promise<string> {
  const q = getDlqQueue();
  const job = await q.add('dlq-entry', input, {
    jobId: `dlq:${input.transaction_id}:${Date.now()}`,
  });
  logger.warn({
    msg: 'pushed_to_dlq',
    transaction_id: input.transaction_id,
    reason: input.reason,
    job_id: job.id,
    queue: env.DLQ_NAME,
  });
  return job.id ?? '';
}

export async function closeQueues(): Promise<void> {
  if (mainQueue) {
    await mainQueue.close();
    mainQueue = undefined;
  }
  if (dlqQueue) {
    await dlqQueue.close();
    dlqQueue = undefined;
  }
}

export function createQueueEvents(): QueueEvents {
  return new QueueEvents(env.QUEUE_NAME, { connection: getRedis() });
}
