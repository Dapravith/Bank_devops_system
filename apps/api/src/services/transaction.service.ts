import { Prisma, ProcessingStatus, Transaction } from '@prisma/client';
import { prisma } from '../config/database';
import {
  ListTransactionsInput,
  transactionRepository,
} from '../repositories/transaction.repository';
import { jobLogRepository } from '../repositories/jobLog.repository';
import { outboxRepository } from '../repositories/outbox.repository';
import { transactionsCreatedTotal } from '../metrics/registry';
import { ConflictError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';
import { NotifyTransactionInput } from '../utils/validation';
import {
  JobLogResponseData,
  TransactionDetailResponseData,
  TransactionListItemData,
  TransactionListResponseData,
  TransactionResponseData,
} from '../types/api';

export interface AcceptTransactionResult {
  transaction_id: string;
  processing_status: string;
}

function toListItem(tx: Transaction): TransactionListItemData {
  return {
    transaction_id: tx.transaction_id,
    account_id: tx.account_id,
    amount: tx.amount.toString(),
    currency: tx.currency,
    status: tx.status,
    processing_status: tx.processing_status,
    created_at: tx.created_at.toISOString(),
    updated_at: tx.updated_at.toISOString(),
  };
}

function toResponse(tx: Transaction): TransactionResponseData {
  return {
    transaction_id: tx.transaction_id,
    account_id: tx.account_id,
    amount: tx.amount.toString(),
    currency: tx.currency,
    status: tx.status,
    description: tx.description,
    processing_status: tx.processing_status,
    partner_response: tx.partner_response,
    error_message: tx.error_message,
    created_at: tx.created_at.toISOString(),
    updated_at: tx.updated_at.toISOString(),
  };
}

export const transactionService = {
  async acceptNotification(
    input: NotifyTransactionInput,
    requestId: string,
  ): Promise<AcceptTransactionResult> {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const txn = await tx.transaction.create({
          data: {
            transaction_id: input.transaction_id,
            account_id: input.account_id,
            amount: new Prisma.Decimal(input.amount),
            currency: input.currency.toUpperCase(),
            status: input.status,
            description: input.description ?? null,
            processing_status: ProcessingStatus.PENDING,
          },
        });
        await outboxRepository.create(tx, {
          aggregate_type: 'transaction',
          aggregate_id: input.transaction_id,
          event_type: 'transaction.notify',
          payload: { transaction_id: input.transaction_id },
        });
        return txn;
      });

      transactionsCreatedTotal.inc({ currency: created.currency });

      logger.info({
        msg: 'transaction_accepted',
        request_id: requestId,
        transaction_id: created.transaction_id,
        processing_status: created.processing_status,
        delivery: 'outbox',
      });

      return {
        transaction_id: created.transaction_id,
        processing_status: created.processing_status,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError(`Transaction ${input.transaction_id} already exists`);
      }
      throw err;
    }
  },

  async list(input: ListTransactionsInput): Promise<TransactionListResponseData> {
    const { total, items } = await transactionRepository.list(input);
    return {
      count: items.length,
      total,
      limit: input.limit,
      offset: input.offset,
      items: items.map(toListItem),
    };
  },

  async getDetail(transactionId: string): Promise<TransactionDetailResponseData> {
    const tx = await transactionRepository.findByTransactionId(transactionId);
    if (!tx) {
      throw new NotFoundError(`Transaction ${transactionId} not found`);
    }
    const logs = await jobLogRepository.findByTransactionId(transactionId);
    const jobLogs: JobLogResponseData[] = logs
      .map((l) => ({
        id: l.id,
        job_id: l.job_id,
        attempt: l.attempt,
        status: l.status,
        message: l.message,
        created_at: l.created_at.toISOString(),
      }))
      .reverse(); // newest-first
    return {
      ...toResponse(tx),
      job_logs: jobLogs,
    };
  },

  async getByTransactionId(transactionId: string): Promise<TransactionResponseData> {
    const tx = await transactionRepository.findByTransactionId(transactionId);
    if (!tx) {
      throw new NotFoundError(`Transaction ${transactionId} not found`);
    }
    return toResponse(tx);
  },

  async getJobLogs(transactionId: string) {
    return jobLogRepository.findByTransactionId(transactionId);
  },
};
