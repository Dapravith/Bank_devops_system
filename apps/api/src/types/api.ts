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
  processing_status: string;
}

export interface TransactionResponseData {
  transaction_id: string;
  account_id: string;
  amount: string;
  currency: string;
  status: string;
  description: string | null;
  processing_status: string;
  partner_response: unknown;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobLogResponseData {
  id: number;
  job_id: string;
  attempt: number;
  status: string;
  message: string | null;
  created_at: string;
}

export interface TransactionDetailResponseData extends TransactionResponseData {
  job_logs: JobLogResponseData[];
}

export interface TransactionListItemData {
  transaction_id: string;
  account_id: string;
  amount: string;
  currency: string;
  status: string;
  processing_status: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionListResponseData {
  count: number;
  total: number;
  limit: number;
  offset: number;
  items: TransactionListItemData[];
}

export interface JobsSummaryResponseData {
  transactions: {
    PENDING: number;
    PROCESSING: number;
    SUCCESS: number;
    FAILED: number;
    RETRY: number;
  };
  dlq_open: number;
  outbox_pending: number;
}

export interface SystemStatusResponseData {
  api: { status: 'ok'; uptime_seconds: number };
  database: { status: 'ok' | 'fail' };
  redis: { status: 'ok' | 'fail' };
  queue: { wait: number; active: number; delayed: number; failed: number };
}
