import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ProcessingStatus } from '@prisma/client';
import { transactionService } from '../services/transaction.service';
import { notifyTransactionSchema, transactionIdParamSchema } from '../utils/validation';
import {
  ApiSuccess,
  NotifyResponseData,
  TransactionDetailResponseData,
  TransactionListResponseData,
} from '../types/api';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  processing_status: z.nativeEnum(ProcessingStatus).optional(),
  q: z.string().min(1).max(64).optional(),
});

export const transactionController = {
  async notify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = notifyTransactionSchema.parse(req.body);
      const result = await transactionService.acceptNotification(input, req.requestId);
      const body: ApiSuccess<NotifyResponseData> = {
        status: 1,
        message: 'Transaction notification accepted',
        data: result,
      };
      res.status(202).json(body);
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = listQuerySchema.parse(req.query);
      const data = await transactionService.list(q);
      const body: ApiSuccess<TransactionListResponseData> = {
        status: 1,
        message: 'Transactions retrieved',
        data,
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { transaction_id } = transactionIdParamSchema.parse(req.params);
      const data = await transactionService.getDetail(transaction_id);
      const body: ApiSuccess<TransactionDetailResponseData> = {
        status: 1,
        message: 'Transaction retrieved',
        data,
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
};
