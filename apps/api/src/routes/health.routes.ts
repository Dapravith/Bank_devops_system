import { Router } from 'express';
import { healthController } from '../controllers/health.controller';

export const healthRouter = Router();

healthRouter.get('/health', healthController.health);
healthRouter.get('/ready', healthController.ready);
healthRouter.get('/metrics', healthController.metrics);
