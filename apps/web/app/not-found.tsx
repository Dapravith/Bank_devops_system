import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="empty">
      <h1>404 — Not Found</h1>
      <p>The page you’re looking for doesn’t exist.</p>
      <p>
        <Link href="/">← Back to dashboard</Link>
      </p>
    </div>
  );
}
