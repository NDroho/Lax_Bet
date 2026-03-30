import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function GET() {
  try {
    const [teams, updated] = await Promise.all([
      kv.get('teams_data'),
      kv.get('teams_data_updated'),
    ]);

    return NextResponse.json({
      teams: Array.isArray(teams) ? teams : [],
      updated: updated || null,
    });
  } catch (error: any) {
    return NextResponse.json({ teams: [], updated: null });
  }
}
