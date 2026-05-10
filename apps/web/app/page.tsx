'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ErrorState, Loading } from '@/components/States';
import { StatusPill } from '@/components/StatusPill';
import { api, ApiCallError } from '@/lib/api';
import type { JobsSummary, SystemStatus } from '@/types/api';

export default function DashboardPage() {
  const [jobs, setJobs] = useState<JobsSummary | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [j, s] = await Promise.all([api.jobsSummary(), api.systemStatus()]);
      setJobs(j);
      setSystem(s);
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 10_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !jobs && !system) return <Loading />;

  const total = jobs
    ? Object.values(jobs.transactions).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <>
      <div className="row">
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <button className="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <span className="muted">Auto-refresh every 10s</span>
      </div>

      {error ? <ErrorState message={error} /> : null}

      <h2>Transactions</h2>
      <div className="cards">
        <div className="card">
          <div className="label">Total</div>
          <div className="value">{total}</div>
        </div>
        <div className="card">
          <div className="label">Pending</div>
          <div className="value">{jobs?.transactions.PENDING ?? 0}</div>
        </div>
        <div className="card">
          <div className="label">Processing</div>
          <div className="value">{jobs?.transactions.PROCESSING ?? 0}</div>
        </div>
        <div className="card">
          <div className="label">Success</div>
          <div className="value" style={{ color: 'var(--good)' }}>
            {jobs?.transactions.SUCCESS ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="label">Failed</div>
          <div className="value" style={{ color: 'var(--bad)' }}>
            {jobs?.transactions.FAILED ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="label">Retry</div>
          <div className="value" style={{ color: 'var(--warn)' }}>
            {jobs?.transactions.RETRY ?? 0}
          </div>
        </div>
      </div>

      <h2>Dependency health</h2>
      <div className="cards">
        <div className="card">
          <div className="label">API</div>
          <div className="value"><StatusPill value={system?.api.status ?? 'unknown'} /></div>
          <div className="sub">uptime {system?.api.uptime_seconds ?? 0}s</div>
        </div>
        <div className="card">
          <div className="label">Database</div>
          <div className="value"><StatusPill value={system?.database.status ?? 'unknown'} /></div>
        </div>
        <div className="card">
          <div className="label">Redis</div>
          <div className="value"><StatusPill value={system?.redis.status ?? 'unknown'} /></div>
        </div>
        <div className="card">
          <div className="label">Outbox pending</div>
          <div className="value">{jobs?.outbox_pending ?? 0}</div>
        </div>
        <div className="card">
          <div className="label">DLQ open</div>
          <div className="value" style={{ color: (jobs?.dlq_open ?? 0) > 0 ? 'var(--bad)' : undefined }}>
            {jobs?.dlq_open ?? 0}
          </div>
        </div>
      </div>

      <h2>Queue</h2>
      <div className="cards">
        <div className="card"><div className="label">wait</div><div className="value">{system?.queue.wait ?? 0}</div></div>
        <div className="card"><div className="label">active</div><div className="value">{system?.queue.active ?? 0}</div></div>
        <div className="card"><div className="label">delayed</div><div className="value">{system?.queue.delayed ?? 0}</div></div>
        <div className="card"><div className="label">failed</div><div className="value">{system?.queue.failed ?? 0}</div></div>
      </div>

      <p className="muted" style={{ marginTop: '1.5rem' }}>
        Jump to{' '}
        <Link href="/transactions">/transactions</Link>,{' '}
        <Link href="/notify">/notify</Link>, or{' '}
        <Link href="/system">/system</Link>.
      </p>
    </>
  );
}
