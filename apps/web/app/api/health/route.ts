import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Local liveness probe for the Next.js process. The dashboard's actual
// data comes from the API service via NEXT_PUBLIC_API_BASE_URL.
export function GET() {
  return NextResponse.json({ status: 'ok', uptime: process.uptime() });
}
