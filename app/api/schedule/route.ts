import { NextResponse } from 'next/server';

interface GameEntry {
  away: string;
  home: string;
  date: string;
  time: string;
  tv: string;
  note: string;
}

export async function GET() {
  try {
    const today = new Date();
    const espnDate = today.toISOString().split('T')[0].replace(/-/g, '');
    const url = `https://site.api.espn.com/apis/site/v2/sports/lacrosse/mens-college-lacrosse/scoreboard?dates=${espnDate}`;

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json({ games: [], updated: null });
    }

    const data = await res.json();
    const games: GameEntry[] = [];

    for (const event of data.events || []) {
      const competition = event.competitions?.[0];
      if (!competition) continue;

      let away = '', home = '';
      for (const competitor of competition.competitors || []) {
        const teamName = competitor.team?.displayName || competitor.team?.shortDisplayName || competitor.team?.name || '';
        if (competitor.homeAway ===
