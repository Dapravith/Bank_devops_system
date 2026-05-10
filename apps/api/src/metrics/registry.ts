import client from 'prom-client';

export const register = new client.Registry();

register.setDefaultLabels({ app: 'banking-devops-platform' });

client.collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const transactionsCreatedTotal = new client.Counter({
  name: 'transactions_created_total',
  help: 'Total number of transactions accepted by the API',
  labelNames: ['currency'] as const,
  registers: [register],
});

export const transactionJobsSuccessTotal = new client.Counter({
  name: 'transaction_jobs_success_total',
  help: 'Total number of transaction jobs that succeeded',
  registers: [register],
});

export const transactionJobsFailedTotal = new client.Counter({
  name: 'transaction_jobs_failed_total',
  help: 'Total number of transaction jobs that failed terminally',
  labelNames: ['reason'] as const,
  registers: [register],
});

export const transactionJobProcessingDurationSeconds = new client.Histogram({
  name: 'transaction_job_processing_duration_seconds',
  help: 'Time taken by the worker to process a transaction job (seconds)',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const databaseHealthStatus = new client.Gauge({
  name: 'database_health_status',
  help: 'Database connectivity (1 = healthy, 0 = unhealthy)',
  registers: [register],
});

export const redisHealthStatus = new client.Gauge({
  name: 'redis_health_status',
  help: 'Redis connectivity (1 = healthy, 0 = unhealthy)',
  registers: [register],
});

// Outbox dispatcher metrics
export const outboxDispatchedTotal = new client.Counter({
  name: 'outbox_events_dispatched_total',
  help: 'Total outbox events successfully dispatched to BullMQ',
  labelNames: ['event_type'] as const,
  registers: [register],
});

export const outboxDispatchFailedTotal = new client.Counter({
  name: 'outbox_events_dispatch_failed_total',
  help: 'Total outbox events that failed to dispatch and were re-queued',
  labelNames: ['event_type'] as const,
  registers: [register],
});

export const outboxPendingGauge = new client.Gauge({
  name: 'outbox_pending_events',
  help: 'Current number of PENDING events in the outbox',
  registers: [register],
});

export const outboxLagSeconds = new client.Gauge({
  name: 'outbox_dispatch_lag_seconds',
  help: 'Age of the oldest PENDING outbox event when dispatched',
  registers: [register],
});

// DLQ metrics
export const dlqEntriesTotal = new client.Counter({
  name: 'dlq_entries_total',
  help: 'Total transactions written to the dead-letter queue',
  registers: [register],
});

export const dlqRequeuedTotal = new client.Counter({
  name: 'dlq_requeued_total',
  help: 'Total DLQ entries requeued by an operator',
  registers: [register],
});
