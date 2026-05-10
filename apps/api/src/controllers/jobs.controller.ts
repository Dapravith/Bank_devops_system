import { NextFunction, Request, Response } from 'express';
import { jobsService } from '../services/jobs.service';
import { ApiSuccess, JobsSummaryResponseData } from '../types/api';

export const jobsController = {
  async summary(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await jobsService.summary();
      const body: ApiSuccess<JobsSummaryResponseData> = {
        status: 1,
        message: 'Jobs summary',
        data,
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
};
