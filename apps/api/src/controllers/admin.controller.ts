import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { dlqService } from '../services/dlq.service';
import { transactionIdParamSchema } from '../utils/validation';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['OPEN', 'REQUEUED', 'DISMISSED']).optional(),
});

export const adminController = {
  async listDlq(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = listQuerySchema.parse(req.query);
      const data = await dlqService.list(q.limit, q.offset, q.status as any);
      res.status(200).json({ status: 1, message: 'DLQ entries retrieved', data });
    } catch (err) {
      next(err);
    }
  },

  async requeue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { transaction_id } = transactionIdParamSchema.parse(req.params);
      const data = await dlqService.requeue(transaction_id, req.requestId);
      res.status(202).json({ status: 1, message: 'DLQ entry requeued', data });
    } catch (err) {
      next(err);
    }
  },

  async dismiss(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { transaction_id } = transactionIdParamSchema.parse(req.params);
      const data = await dlqService.dismiss(transaction_id, req.requestId);
      res.status(200).json({ status: 1, message: 'DLQ entry dismissed', data });
    } catch (err) {
      next(err);
    }
  },
};
