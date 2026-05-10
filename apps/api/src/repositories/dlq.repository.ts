import { DlqEntry, DlqStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export const dlqRepository = {
  async create(input: {
    transaction_id: string;
    reason: string;
    attempts: number;
    payload: Prisma.InputJsonValue;
  }): Promise<DlqEntry> {
    return prisma.dlqEntry.create({ data: input });
  },

  async findOpenByTransactionId(transactionId: string): Promise<DlqEntry | null> {
    return prisma.dlqEntry.findFirst({
      where: { transaction_id: transactionId, status: DlqStatus.OPEN },
      orderBy: { created_at: 'desc' },
    });
  },

  async list(limit = 50, offset = 0, status?: DlqStatus): Promise<DlqEntry[]> {
    return prisma.dlqEntry.findMany({
      where: status ? { status } : undefined,
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });
  },

  async updateStatus(id: number, status: DlqStatus): Promise<DlqEntry> {
    return prisma.dlqEntry.update({ where: { id }, data: { status } });
  },

  async countOpen(): Promise<number> {
    return prisma.dlqEntry.count({ where: { status: DlqStatus.OPEN } });
  },
};
