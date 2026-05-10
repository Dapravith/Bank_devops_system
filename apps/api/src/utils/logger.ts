import pino from 'pino';
import { env } from '../config/env';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  '*.password',
  '*.token',
  '*.secret',
  'DATABASE_URL',
  'REDIS_URL',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'banking-devops-platform',
    env: env.NODE_ENV,
  },
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});
