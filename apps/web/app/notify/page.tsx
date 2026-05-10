'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api, ApiCallError } from '@/lib/api';

interface FormState {
  transaction_id: string;
  account_id: string;
  amount: string;
  currency: string;
  status: string;
  description: string;
}

const initial: FormState = {
  transaction_id: '',
  account_id: '',
  amount: '',
  currency: 'USD',
  status: 'SUCCESS',
  description: '',
};

function generateTxnId(): string {
  return `TXN-${Date.now()}-${Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, '0')}`;
}

export default function NotifyPage() {
  const [form, setForm] = useState<FormState>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ transaction_id: string } | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = {
      ...form,
      transaction_id: form.transaction_id.trim() || generateTxnId(),
      account_id: form.account_id.trim(),
      currency: form.currency.trim().toUpperCase(),
      status: form.status.trim(),
      description: form.description.trim(),
    };

    if (!trimmed.account_id) {
      setError('account_id is required');
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('amount must be a positive number');
      return;
    }
    if (trimmed.currency.length !== 3) {
      setError('currency must be a 3-letter code');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.notify({
        transaction_id: trimmed.transaction_id,
        account_id: trimmed.account_id,
        amount,
        currency: trimmed.currency,
        status: trimmed.status,
        ...(trimmed.description ? { description: trimmed.description } : {}),
      });
      setSuccess({ transaction_id: res.transaction_id });
      setForm({ ...initial });
    } catch (err) {
      setError(err instanceof ApiCallError ? err.message : 'Failed to submit notification');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Submit a notification</h1>
      <p className="muted">
        For DevOps demo only. Submits to <code>POST /api/v1/transactions/notify</code>.
      </p>

      {error ? <div className="alert error">{error}</div> : null}
      {success ? (
        <div className="alert success">
          Accepted as <strong>{success.transaction_id}</strong>.{' '}
          <Link href={`/transactions/${encodeURIComponent(success.transaction_id)}`}>
            View detail →
          </Link>
        </div>
      ) : null}

      <form className="form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="transaction_id">transaction_id</label>
          <input
            id="transaction_id"
            value={form.transaction_id}
            onChange={(e) => update('transaction_id', e.target.value)}
            placeholder="auto-generated if blank"
          />
        </div>
        <div className="field">
          <label htmlFor="account_id">account_id *</label>
          <input
            id="account_id"
            required
            value={form.account_id}
            onChange={(e) => update('account_id', e.target.value)}
            placeholder="ACC-001"
          />
        </div>
        <div className="field">
          <label htmlFor="amount">amount *</label>
          <input
            id="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={form.amount}
            onChange={(e) => update('amount', e.target.value)}
            placeholder="100.50"
          />
        </div>
        <div className="field">
          <label htmlFor="currency">currency *</label>
          <input
            id="currency"
            required
            maxLength={3}
            value={form.currency}
            onChange={(e) => update('currency', e.target.value.toUpperCase())}
          />
        </div>
        <div className="field">
          <label htmlFor="status">status *</label>
          <select
            id="status"
            value={form.status}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="SUCCESS">SUCCESS</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
          </select>
        </div>
        <div className="field full">
          <label htmlFor="description">description</label>
          <input
            id="description"
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="Payment received"
          />
        </div>
        <div className="actions">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit notification'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setForm({ ...initial });
              setError(null);
              setSuccess(null);
            }}
          >
            Reset
          </button>
        </div>
      </form>
    </>
  );
}
