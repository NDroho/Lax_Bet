import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function GET() {
  try {
    const [rankingsRaw, updated] = await Promise.all([
      kv.get('rankings'),
      kv.get('rankings_updated'),
    ]);
    const data = rankingsRaw ? (typeof rankingsRaw === 'string' ? JSON.parse(rankingsRaw) : rankingsRaw) : null;
    return NextResponse.json({
      rankings: data?.rankings || [],
      alsoConsidered: data?.alsoConsidered || [],
      weekLabel: data?.weekLabel || '',
      updated: updated || null,
    });
  } catch (error: any) {
    console.error('Error reading rankings:', error);
    return NextResponse.json({ rankings: [], alsoConsidered: [], weekLabel: '', updated: null });
  }
}
