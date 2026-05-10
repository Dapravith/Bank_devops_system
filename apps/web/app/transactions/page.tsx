'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Empty, ErrorState, Loading } from '@/components/States';
import { StatusPill } from '@/components/StatusPill';
import { api, ApiCallError } from '@/lib/api';
import { formatAmount, formatTimestamp } from '@/lib/format';
import type { ProcessingStatus, TransactionListResponse } from '@/types/api';

const STATUSES: ProcessingStatus[] = ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'RETRY'];
const PAGE_SIZE = 20;

export default function TransactionsPage() {
  const [data, setData] = useState<TransactionListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listTransactions({
        limit: PAGE_SIZE,
        offset,
        processing_status: status || undefined,
        q: q.trim() || undefined,
      });
      setData(res);
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, [offset, status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setOffset(0);
    void load();
  };

  return (
    <>
      <div className="row">
        <h1 style={{ margin: 0 }}>Transactions</h1>
        <button className="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <form className="row" onSubmit={onSearch}>
        <input
          type="search"
          placeholder="Search transaction_id or account_id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 280 }}
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit">Search</button>
      </form>

      {error ? <ErrorState message={error} /> : null}

      {loading && !data ? <Loading /> : null}

      {data && data.items.length === 0 ? (
        <Empty label="No transactions match your filters." />
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Processing</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.transaction_id}>
                  <td>
                    <Link href={`/transactions/${encodeURIComponent(t.transaction_id)}`}>
                      {t.transaction_id}
                    </Link>
                  </td>
                  <td>{t.account_id}</td>
                  <td>{formatAmount(t.amount, t.currency)}</td>
                  <td>{t.status}</td>
                  <td><StatusPill value={t.processing_status} /></td>
                  <td>{formatTimestamp(t.created_at)}</td>
                  <td>{formatTimestamp(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: '1rem', justifyContent: 'space-between' }}>
            <span className="muted">
              Showing {data.offset + 1}–{Math.min(data.offset + data.count, data.total)} of {data.total}
            </span>
            <div className="row" style={{ margin: 0 }}>
              <button
                className="secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                className="secondary"
                disabled={offset + data.count >= data.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
