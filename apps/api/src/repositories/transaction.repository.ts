import { Prisma, ProcessingStatus, Transaction } from '@prisma/client';
import { prisma } from '../config/database';

export interface CreateTransactionInput {
  transaction_id: string;
  account_id: string;
  amount: number;
  currency: string;
  status: string;
  description?: string;
}

export interface UpdateProcessingExtras {
  partner_response?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  error_message?: string | null;
}

export interface ListTransactionsInput {
  limit: number;
  offset: number;
  processing_status?: ProcessingStatus;
  q?: string;
}

export interface ListTransactionsResult {
  total: number;
  items: Transaction[];
}

export const transactionRepository = {
  async create(input: CreateTransactionInput): Promise<Transaction> {
    return prisma.transaction.create({
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
  },

  async findByTransactionId(transactionId: string): Promise<Transaction | null> {
    return prisma.transaction.findUnique({
      where: { transaction_id: transactionId },
    });
  },

  async list(input: ListTransactionsInput): Promise<ListTransactionsResult> {
    const where: Prisma.TransactionWhereInput = {};
    if (input.processing_status) {
      where.processing_status = input.processing_status;
    }
    if (input.q) {
      where.OR = [
        { transaction_id: { contains: input.q, mode: 'insensitive' } },
        { account_id: { contains: input.q, mode: 'insensitive' } },
      ];
    }
    const [total, items] = await prisma.$transaction([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: input.limit,
        skip: input.offset,
      }),
    ]);
    return { total, items };
  },

  async countByProcessingStatus(): Promise<Record<ProcessingStatus, number>> {
    const rows = await prisma.transaction.groupBy({
      by: ['processing_status'],
      _count: { processing_status: true },
    });
    const result: Record<ProcessingStatus, number> = {
      PENDING: 0,
      PROCESSING: 0,
      SUCCESS: 0,
      FAILED: 0,
      RETRY: 0,
    };
    for (const r of rows) {
      result[r.processing_status] = r._count.processing_status;
    }
    return result;
  },

  async updateProcessingStatus(
    transactionId: string,
    processingStatus: ProcessingStatus,
    extras: UpdateProcessingExtras = {},
  ): Promise<Transaction> {
    const data: Prisma.TransactionUpdateInput = {
      processing_status: processingStatus,
    };
    if (extras.partner_response !== undefined) {
      data.partner_response = extras.partner_response;
    }
    if (extras.error_message !== undefined) {
      data.error_message = extras.error_message;
    }
    return prisma.transaction.update({
      where: { transaction_id: transactionId },
      data,
    });
  },
};
