import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function GET() {
  try {
    const [teamsRaw, updated] = await Promise.all([
      kv.get('teams'),
      kv.get('teams_updated'),
    ]);
    const teams = teamsRaw ? (typeof teamsRaw === 'string' ? JSON.parse(teamsRaw) : teamsRaw) : [];
    return NextResponse.json({ teams, updated: updated || null });
  } catch (error: any) {
    return NextResponse.json({ teams: [], updated: null });
  }
}
