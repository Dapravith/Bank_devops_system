import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    status: 0,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    logger.warn({
      msg: 'validation_error',
      request_id: req.requestId,
      details,
    });
    res.status(400).json({
      status: 0,
      message: 'Validation failed',
      errors: details,
    });
    return;
  }

  if (err instanceof AppError) {
    logger.warn({
      msg: 'app_error',
      request_id: req.requestId,
      code: err.code,
      status_code: err.statusCode,
      error_message: err.message,
    });
    res.status(err.statusCode).json({
      status: 0,
      message: err.message,
      ...(err.details ? { errors: err.details } : {}),
    });
    return;
  }

  const e = err as Error;
  logger.error({
    msg: 'unhandled_error',
    request_id: req.requestId,
    error_message: e?.message,
    stack: env.NODE_ENV === 'production' ? undefined : e?.stack,
  });

  res.status(500).json({
    status: 0,
    message: env.NODE_ENV === 'production' ? 'Internal server error' : (e?.message ?? 'Internal server error'),
  });
}
