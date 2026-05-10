import { z } from 'zod';

export const notifyTransactionSchema = z.object({
  transaction_id: z.string().min(1).max(64),
  account_id: z.string().min(1).max(64),
  amount: z.number().positive().finite(),
  currency: z.string().length(3),
  status: z.string().min(1).max(32),
  description: z.string().max(500).optional(),
});

export type NotifyTransactionInput = z.infer<typeof notifyTransactionSchema>;

export const transactionIdParamSchema = z.object({
  transaction_id: z.string().min(1).max(64),
});
