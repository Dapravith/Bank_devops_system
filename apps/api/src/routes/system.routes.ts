import { Router } from 'express';
import { systemController } from '../controllers/system.controller';

export const systemRouter = Router();

systemRouter.get('/status', systemController.status);
