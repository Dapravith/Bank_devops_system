import { env } from '../config/env';

export interface PartnerApiResponse {
  partner_reference: string;
  acknowledged_at: string;
  latency_ms: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomLatency(): number {
  const min = env.PARTNER_API_MIN_LATENCY_MS;
  const max = env.PARTNER_API_MAX_LATENCY_MS;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Simulates a downstream banking partner API call.
 * Real systems would use an HTTP client + circuit breaker here.
 */
export async function callPartnerApi(transactionId: string): Promise<PartnerApiResponse> {
  const latency = randomLatency();
  await delay(latency);

  if (Math.random() < env.PARTNER_API_FAILURE_RATE) {
    throw new Error(`Partner API transient failure (latency=${latency}ms, txn=${transactionId})`);
  }

  return {
    partner_reference: `PRT-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    acknowledged_at: new Date().toISOString(),
    latency_ms: latency,
  };
}
