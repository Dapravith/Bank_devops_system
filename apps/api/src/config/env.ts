import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  CORS_ORIGINS: z.string().default('*'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  QUEUE_NAME: z.string().default('transaction-notification-queue'),
  DLQ_NAME: z.string().default('transaction-notification-dlq'),
  JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),
  JOB_BACKOFF_DELAY_MS: z.coerce.number().int().positive().default(5_000),

  PARTNER_API_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.2),
  PARTNER_API_MIN_LATENCY_MS: z.coerce.number().int().nonnegative().default(200),
  PARTNER_API_MAX_LATENCY_MS: z.coerce.number().int().nonnegative().default(1500),

  // OpenTelemetry
  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OTEL_SERVICE_NAME: z.string().default('banking-devops-platform'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),

  // JWT auth for partner endpoint
  JWT_AUTH_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  PARTNER_JWT_SECRET: z.string().default('change-me-in-production'),
  PARTNER_JWT_ISSUER: z.string().default('banking-partner'),
  PARTNER_JWT_AUDIENCE: z.string().default('banking-devops-platform'),

  // Outbox pattern
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(100),

  // Admin auth for DLQ endpoints (separate from partner JWT)
  ADMIN_API_KEY: z.string().default('change-me-admin-key'),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

export function loadEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // eslint-disable-next-line no-console
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}

export const env = loadEnv();
