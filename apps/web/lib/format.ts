export function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function formatAmount(amount: string, currency: string): string {
  const n = Number(amount);
  if (Number.isFinite(n)) {
    return `${n.toFixed(2)} ${currency}`;
  }
  return `${amount} ${currency}`;
}
