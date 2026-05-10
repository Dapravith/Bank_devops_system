import { NextFunction, Request, Response } from 'express';
import { httpRequestDurationSeconds, httpRequestsTotal } from '../metrics/registry';

const EXCLUDED = new Set(['/metrics']);

export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (EXCLUDED.has(req.path)) {
      next();
      return;
    }

    const endTimer = httpRequestDurationSeconds.startTimer();

    res.on('finish', () => {
      const route = req.route?.path ?? req.path;
      const labels = {
        method: req.method,
        route,
        status: String(res.statusCode),
      };
      httpRequestsTotal.inc(labels);
      endTimer(labels);
    });

    next();
  };
}
