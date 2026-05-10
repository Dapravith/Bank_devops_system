import { DlqStatus, ProcessingStatus } from '@prisma/client';
import { dlqRepository } from '../repositories/dlq.repository';
import { transactionRepository } from '../repositories/transaction.repository';
import { enqueueTransactionJob } from '../jobs/queue';
import { dlqRequeuedTotal } from '../metrics/registry';
import { NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

export const dlqService = {
  async list(limit: number, offset: number, status?: DlqStatus) {
    const items = await dlqRepository.list(limit, offset, status);
    const open_count = await dlqRepository.countOpen();
    return {
      open_count,
      count: items.length,
      items: items.map((i) => ({
        id: i.id,
        transaction_id: i.transaction_id,
        reason: i.reason,
        attempts: i.attempts,
        status: i.status,
        created_at: i.created_at.toISOString(),
        updated_at: i.updated_at.toISOString(),
      })),
    };
  },

  async requeue(transactionId: string, requestId: string) {
    const entry = await dlqRepository.findOpenByTransactionId(transactionId);
    if (!entry) {
      throw new NotFoundError(`No OPEN DLQ entry for ${transactionId}`);
    }
    const tx = await transactionRepository.findByTransactionId(transactionId);
    if (!tx) {
      throw new NotFoundError(`Transaction ${transactionId} not found`);
    }

    await transactionRepository.updateProcessingStatus(transactionId, ProcessingStatus.PENDING, {
      error_message: null,
    });
    const jobId = await enqueueTransactionJob(transactionId);
    await dlqRepository.updateStatus(entry.id, DlqStatus.REQUEUED);
    dlqRequeuedTotal.inc();

    logger.info({
      msg: 'dlq_requeued',
      request_id: requestId,
      transaction_id: transactionId,
      dlq_id: entry.id,
      job_id: jobId,
    });

    return { transaction_id: transactionId, dlq_id: entry.id, job_id: jobId };
  },

  async dismiss(transactionId: string, requestId: string) {
    const entry = await dlqRepository.findOpenByTransactionId(transactionId);
    if (!entry) {
      throw new NotFoundError(`No OPEN DLQ entry for ${transactionId}`);
    }
    await dlqRepository.updateStatus(entry.id, DlqStatus.DISMISSED);
    logger.info({
      msg: 'dlq_dismissed',
      request_id: requestId,
      transaction_id: transactionId,
      dlq_id: entry.id,
    });
    return { transaction_id: transactionId, dlq_id: entry.id };
  },
};
