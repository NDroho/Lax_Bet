import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Calls the cron endpoints server-side so the client never needs the secret
export async function POST(request: Request) {
  const reqUrl = new URL(request.url);
  const { searchParams } = reqUrl;
  const target = searchParams.get('target'); // 'rankings' | 'stats' | 'all'

  const base = `${reqUrl.protocol}//${reqUrl.host}`;

  const headers: HeadersInit = process.env.CRON_SECRET
    ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
    : {};

  const results: Record<string, any> = {};

  if (target === 'rankings' || target === 'all') {
    try {
      const res = await fetch(`${base}/api/cron/rankings`, { headers });
      results.rankings = await res.json();
    } catch (err: any) {
      results.rankings = { error: err.message };
    }
  }

  if (target === 'stats' || target === 'all') {
    try {
      const res = await fetch(`${base}/api/cron/stats`, { headers });
      results.stats = await res.json();
    } catch (err: any) {
      results.stats = { error: err.message };
    }
  }

  if (!target) {
    return NextResponse.json({ error: 'Missing target param: rankings | stats | all' }, { status: 400 });
  }

  return NextResponse.json(results);
}
