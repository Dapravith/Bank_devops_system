'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ErrorState, Loading } from '@/components/States';
import { StatusPill } from '@/components/StatusPill';
import { api, ApiCallError } from '@/lib/api';
import { formatAmount, formatTimestamp } from '@/lib/format';
import type { TransactionDetail } from '@/types/api';

export default function TransactionDetailPage() {
  const params = useParams<{ transaction_id: string }>();
  const transactionId = decodeURIComponent(params?.transaction_id ?? '');
  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTransaction(transactionId);
      setTx(res);
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : 'Failed to load transaction');
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !tx) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!tx) return <ErrorState message="Transaction not found" />;

  return (
    <>
      <div className="row">
        <h1 style={{ margin: 0 }}>Transaction</h1>
        <Link href="/transactions" className="secondary">
          ← back to list
        </Link>
        <button className="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginBottom: '1rem' }}>{tx.transaction_id}</h2>
        <div className="cards" style={{ marginBottom: 0 }}>
          <div>
            <div className="label">Account</div>
            <div>{tx.account_id}</div>
          </div>
          <div>
            <div className="label">Amount</div>
            <div>{formatAmount(tx.amount, tx.currency)}</div>
          </div>
          <div>
            <div className="label">Partner status</div>
            <div>{tx.status}</div>
          </div>
          <div>
            <div className="label">Processing status</div>
            <div><StatusPill value={tx.processing_status} /></div>
          </div>
          <div>
            <div className="label">Created</div>
            <div>{formatTimestamp(tx.created_at)}</div>
          </div>
          <div>
            <div className="label">Updated</div>
            <div>{formatTimestamp(tx.updated_at)}</div>
          </div>
        </div>
        {tx.description ? (
          <div style={{ marginTop: '1rem' }}>
            <div className="label">Description</div>
            <div>{tx.description}</div>
          </div>
        ) : null}
      </div>

      <h2>Partner response</h2>
      {tx.partner_response ? (
        <pre>{JSON.stringify(tx.partner_response, null, 2)}</pre>
      ) : (
        <div className="empty">No partner response yet.</div>
      )}

      {tx.error_message ? (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>Error</h2>
          <div className="alert error">{tx.error_message}</div>
        </>
      ) : null}

      <h2 style={{ marginTop: '1.5rem' }}>Job logs</h2>
      {tx.job_logs.length === 0 ? (
        <div className="empty">No job attempts recorded yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Attempt</th>
              <th>Job ID</th>
              <th>Status</th>
              <th>Message</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {tx.job_logs.map((l) => (
              <tr key={l.id}>
                <td>{l.attempt}</td>
                <td><code>{l.job_id}</code></td>
                <td><StatusPill value={l.status} /></td>
                <td>{l.message ?? <span className="muted">—</span>}</td>
                <td>{formatTimestamp(l.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
