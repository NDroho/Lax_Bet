import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
 
export async function GET() {
  try {
    const [scheduleRaw, updated] = await Promise.all([
      kv.get('schedule'),
      kv.get('schedule_updated'),
    ]);
 
    let games: any[] = [];
 
    if (scheduleRaw) {
      if (typeof scheduleRaw === 'string') {
        try {
          games = JSON.parse(scheduleRaw);
        } catch {
          games = [];
        }
      } else if (Array.isArray(scheduleRaw)) {
        games = scheduleRaw;
      }
    }
 
    return NextResponse.json({
      games,
      updated: updated || null,
      debug: {
        rawType: typeof scheduleRaw,
        isArray: Array.isArray(scheduleRaw),
        rawLength: typeof scheduleRaw === 'string' ? scheduleRaw.length : Array.isArray(scheduleRaw) ? scheduleRaw.length : 0,
      },
    });
  } catch (error: any) {
    console.error('Error reading schedule:', error);
    return NextResponse.json({ games: [], updated: null, error: error.message });
  }
}
