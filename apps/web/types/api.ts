// Shapes mirrored from apps/api/src/types/api.ts. Kept hand-written to avoid
// pulling the API package into the web bundle. If they diverge, the web pages
// degrade gracefully (loading / error / empty states).

export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'RETRY';

export interface ApiSuccess<T> {
  status: 1;
  message: string;
  data: T;
}

export interface ApiError {
  status: 0;
  message: string;
  errors?: unknown;
}

export interface NotifyResponseData {
  transaction_id: string;
  processing_status: ProcessingStatus;
}

export interface JobLog {
  id: number;
  job_id: string;
  attempt: number;
  status: string;
  message: string | null;
  created_at: string;
}

export interface TransactionListItem {
  transaction_id: string;
  account_id: string;
  amount: string;
  currency: string;
  status: string;
  processing_status: ProcessingStatus;
  created_at: string;
  updated_at: string;
}

export interface TransactionListResponse {
  count: number;
  total: number;
  limit: number;
  offset: number;
  items: TransactionListItem[];
}

export interface TransactionDetail extends TransactionListItem {
  description: string | null;
  partner_response: unknown;
  error_message: string | null;
  job_logs: JobLog[];
}

export interface JobsSummary {
  transactions: Record<ProcessingStatus, number>;
  dlq_open: number;
  outbox_pending: number;
}

export interface SystemStatus {
  api: { status: 'ok'; uptime_seconds: number };
  database: { status: 'ok' | 'fail' };
  redis: { status: 'ok' | 'fail' };
  queue: { wait: number; active: number; delayed: number; failed: number };
}
