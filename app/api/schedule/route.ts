import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function GET() {
  try {
    const [games, updated] = await Promise.all([
      kv.get('schedule_data'),
      kv.get('schedule_data_updated'),
    ]);

    return NextResponse.json({
      games: Array.isArray(games) ? games : [],
      updated: updated || null,
    });
  } catch (error: any) {
    return NextResponse.json({ games: [], updated: null });
  }
}
