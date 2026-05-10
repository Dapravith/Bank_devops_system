import { OutboxEvent, OutboxStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export const outboxRepository = {
  async claimPending(batchSize: number): Promise<OutboxEvent[]> {
    // SKIP LOCKED makes this safe across multiple dispatcher replicas.
    const rows = await prisma.$queryRaw<OutboxEvent[]>`
      UPDATE "OutboxEvent"
      SET status = 'DISPATCHED', dispatched_at = NOW(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM "OutboxEvent"
        WHERE status = 'PENDING'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      RETURNING *;
    `;
    return rows;
  },

  async markFailed(id: number, err: string): Promise<void> {
    await prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.PENDING,
        last_error: err.slice(0, 500),
      },
    });
  },

  async create(
    tx: Prisma.TransactionClient,
    input: {
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
      payload: Prisma.InputJsonValue;
    },
  ): Promise<OutboxEvent> {
    return tx.outboxEvent.create({ data: input });
  },

  async countPending(): Promise<number> {
    return prisma.outboxEvent.count({ where: { status: OutboxStatus.PENDING } });
  },
};
