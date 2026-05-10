import { Router } from 'express';
import { jobsController } from '../controllers/jobs.controller';

export const jobsRouter = Router();

jobsRouter.get('/summary', jobsController.summary);
