import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { requireAdminKey } from '../middlewares/auth';

export const adminRouter = Router();

adminRouter.use(requireAdminKey());

adminRouter.get('/dlq', adminController.listDlq);
adminRouter.post('/dlq/:transaction_id/requeue', adminController.requeue);
adminRouter.post('/dlq/:transaction_id/dismiss', adminController.dismiss);
