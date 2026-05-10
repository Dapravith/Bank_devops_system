import { NextFunction, Request, Response } from 'express';
import { getReadiness } from '../services/health.service';
import { register } from '../metrics/registry';

export const healthController = {
  health(_req: Request, res: Response): void {
    res.status(200).json({
      status: 'ok',
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  },

  async ready(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await getReadiness();
      res.status(result.ready ? 200 : 503).json({
        status: result.ready ? 'ready' : 'not_ready',
        checks: result.checks,
      });
    } catch (err) {
      next(err);
    }
  },

  async metrics(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      next(err);
    }
  },
};
