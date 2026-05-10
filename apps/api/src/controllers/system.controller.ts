import { NextFunction, Request, Response } from 'express';
import { systemService } from '../services/system.service';
import { ApiSuccess, SystemStatusResponseData } from '../types/api';

export const systemController = {
  async status(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await systemService.status();
      const body: ApiSuccess<SystemStatusResponseData> = {
        status: 1,
        message: 'System status',
        data,
      };
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  },
};
