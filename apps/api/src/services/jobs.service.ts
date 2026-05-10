import { dlqRepository } from '../repositories/dlq.repository';
import { outboxRepository } from '../repositories/outbox.repository';
import { transactionRepository } from '../repositories/transaction.repository';
import { JobsSummaryResponseData } from '../types/api';

export const jobsService = {
  async summary(): Promise<JobsSummaryResponseData> {
    const [transactions, dlq_open, outbox_pending] = await Promise.all([
      transactionRepository.countByProcessingStatus(),
      dlqRepository.countOpen(),
      outboxRepository.countPending(),
    ]);
    return { transactions, dlq_open, outbox_pending };
  },
};
