import { JobLog } from '@prisma/client';
import { prisma } from '../config/database';

export interface CreateJobLogInput {
  transaction_id: string;
  job_id: string;
  attempt: number;
  status: string;
  message?: string | null;
}

export const jobLogRepository = {
  async create(input: CreateJobLogInput): Promise<JobLog> {
    return prisma.jobLog.create({
      data: {
        transaction_id: input.transaction_id,
        job_id: input.job_id,
        attempt: input.attempt,
        status: input.status,
        message: input.message ?? null,
      },
    });
  },

  async findByTransactionId(transactionId: string): Promise<JobLog[]> {
    return prisma.jobLog.findMany({
      where: { transaction_id: transactionId },
      orderBy: { created_at: 'asc' },
    });
  },
};
