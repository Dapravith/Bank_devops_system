// Client-side fetch helpers. Always read the base URL from a NEXT_PUBLIC_*
// variable so it's never hardcoded. Surfaces structured errors that pages
// can render without leaking backend internals.

import type {
  ApiError,
  ApiSuccess,
  JobsSummary,
  NotifyResponseData,
  SystemStatus,
  TransactionDetail,
  TransactionListResponse,
} from '@/types/api';

export const API_BASE_URL =
  (typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_BASE_URL
    : process.env.NEXT_PUBLIC_API_BASE_URL) || 'http://localhost:3000';

export class ApiCallError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });
  } catch (err) {
    throw new ApiCallError(
      `Network error contacting API at ${url}`,
      0,
      (err as Error).message,
    );
  }
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const body = parsed as ApiError | { message?: string };
    throw new ApiCallError(
      body?.message || `Request failed with status ${res.status}`,
      res.status,
      body,
    );
  }
  return (parsed as ApiSuccess<T>).data;
}

export const api = {
  jobsSummary: () => call<JobsSummary>('/api/v1/jobs/summary'),
  systemStatus: () => call<SystemStatus>('/api/v1/system/status'),
  listTransactions: (params: { limit?: number; offset?: number; processing_status?: string; q?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.limit) sp.set('limit', String(params.limit));
    if (params.offset) sp.set('offset', String(params.offset));
    if (params.processing_status) sp.set('processing_status', params.processing_status);
    if (params.q) sp.set('q', params.q);
    const qs = sp.toString();
    return call<TransactionListResponse>(`/api/v1/transactions${qs ? `?${qs}` : ''}`);
  },
  getTransaction: (transactionId: string) =>
    call<TransactionDetail>(`/api/v1/transactions/${encodeURIComponent(transactionId)}`),
  notify: (body: {
    transaction_id: string;
    account_id: string;
    amount: number;
    currency: string;
    status: string;
    description?: string;
  }) =>
    call<NotifyResponseData>('/api/v1/transactions/notify', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
