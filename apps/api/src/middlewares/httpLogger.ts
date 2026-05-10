import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

export function httpLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
      logger.info({
        msg: 'http_request',
        request_id: req.requestId,
        method: req.method,
        route: req.route?.path ?? req.path,
        path: req.path,
        status: res.statusCode,
        duration_ms: durationMs,
      });
    });

    next();
  };
}
