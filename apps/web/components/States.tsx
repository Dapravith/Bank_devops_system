interface ErrorStateProps { message: string }

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="loading">{label}</div>;
}

export function ErrorState({ message }: ErrorStateProps) {
  return <div className="alert error">{message}</div>;
}

export function Empty({ label = 'No data yet.' }: { label?: string }) {
  return <div className="empty">{label}</div>;
}
