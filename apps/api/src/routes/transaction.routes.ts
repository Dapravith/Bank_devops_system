import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { transactionController } from '../controllers/transaction.controller';
import { env } from '../config/env';
import { requireJwt } from '../middlewares/auth';

export const transactionRouter = Router();

const notifyLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 0,
    message: 'Too many requests, please retry later',
  },
});

transactionRouter.post('/notify', notifyLimiter, requireJwt(), transactionController.notify);
transactionRouter.get('/', transactionController.list);
transactionRouter.get('/:transaction_id', transactionController.getOne);
