import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function GET() {
  try {
    const [scheduleRaw, updated] = await Promise.all([
      kv.get('schedule'),
      kv.get('schedule_updated'),
    ]);
    const games = scheduleRaw ? (typeof scheduleRaw === 'string' ? JSON.parse(scheduleRaw) : scheduleRaw) : [];
    return NextResponse.json({ games, updated: updated || null });
  } catch (error: any) {
    console.error('Error reading schedule:', error);
    return NextResponse.json({ games: [], updated: null });
  }
}
