import { Router } from 'express';
import { adminRouter } from './admin.routes';
import { healthRouter } from './health.routes';
import { jobsRouter } from './jobs.routes';
import { systemRouter } from './system.routes';
import { transactionRouter } from './transaction.routes';

export const apiRouter = Router();
apiRouter.use('/v1/transactions', transactionRouter);
apiRouter.use('/v1/jobs', jobsRouter);
apiRouter.use('/v1/system', systemRouter);
apiRouter.use('/v1/admin', adminRouter);

export { healthRouter };
