// MUST be required first by entrypoints (server.ts, workers/*.ts) when OTEL_ENABLED=true.
// Wraps tracing.startTracing in a guard so importing this file is always safe.
import { startTracing } from './tracing';

const enabled = process.env.OTEL_ENABLED === 'true';
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'banking-devops-platform';
const otlp = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

if (enabled) {
  startTracing(serviceName, otlp);
}
