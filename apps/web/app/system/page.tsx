'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorState, Loading } from '@/components/States';
import { StatusPill } from '@/components/StatusPill';
import { api, API_BASE_URL, ApiCallError } from '@/lib/api';
import type { JobsSummary, SystemStatus } from '@/types/api';

export default function SystemPage() {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [jobs, setJobs] = useState<JobsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, j] = await Promise.all([api.systemStatus(), api.jobsSummary()]);
      setSystem(s);
      setJobs(j);
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : 'Failed to load system status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 10_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !system) return <Loading />;

  return (
    <>
      <div className="row">
        <h1 style={{ margin: 0 }}>System status</h1>
        <button className="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <span className="muted">Auto-refresh every 10s</span>
      </div>

      {error ? <ErrorState message={error} /> : null}

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
          <div className="label">DLQ open</div>
          <div className="value" style={{ color: (jobs?.dlq_open ?? 0) > 0 ? 'var(--bad)' : undefined }}>
            {jobs?.dlq_open ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="label">Outbox pending</div>
          <div className="value">{jobs?.outbox_pending ?? 0}</div>
        </div>
      </div>

      <h2>Queue snapshot</h2>
      <table>
        <thead>
          <tr>
            <th>State</th>
            <th>Count</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>wait</td><td>{system?.queue.wait ?? 0}</td><td>jobs ready to be picked up</td></tr>
          <tr><td>active</td><td>{system?.queue.active ?? 0}</td><td>currently being processed</td></tr>
          <tr><td>delayed</td><td>{system?.queue.delayed ?? 0}</td><td>scheduled for retry (backoff)</td></tr>
          <tr><td>failed</td><td>{system?.queue.failed ?? 0}</td><td>BullMQ-failed jobs (separate from DLQ table)</td></tr>
        </tbody>
      </table>

      <h2 style={{ marginTop: '1.5rem' }}>Probes &amp; metrics</h2>
      <table>
        <thead>
          <tr><th>Endpoint</th><th>Purpose</th><th>Open</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>/health</code></td>
            <td>Liveness probe</td>
            <td><a href={`${API_BASE_URL}/health`} target="_blank" rel="noreferrer">{API_BASE_URL}/health</a></td>
          </tr>
          <tr>
            <td><code>/ready</code></td>
            <td>Readiness probe (DB + Redis)</td>
            <td><a href={`${API_BASE_URL}/ready`} target="_blank" rel="noreferrer">{API_BASE_URL}/ready</a></td>
          </tr>
          <tr>
            <td><code>/metrics</code></td>
            <td>Prometheus scrape</td>
            <td><a href={`${API_BASE_URL}/metrics`} target="_blank" rel="noreferrer">{API_BASE_URL}/metrics</a></td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
