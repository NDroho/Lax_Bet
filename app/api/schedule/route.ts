import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Use Eastern time so the date matches the actual lacrosse game day
    const now = new Date();
    const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const year = eastern.getFullYear();
    const month = String(eastern.getMonth() + 1).padStart(2, '0');
    const day = String(eastern.getDate()).padStart(2, '0');
    const espnDate = `${year}${month}${day}`;
    const dateStr = `${year}-${month}-${day}`;
    const url = 'https://site.api.espn.com/apis/site/v2/sports/lacrosse/mens-college-lacrosse/scoreboard?dates=' + espnDate;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json({ games: [], updated: null });
    }
    const data = await res.json();
    const games: { away: string; home: string; date: string; time: string; tv: string; note: string }[] = [];
    for (const event of data.events || []) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      let away = '';
      let home = '';
      for (const c of comp.competitors || []) {
        const name = c.team?.displayName || c.team?.shortDisplayName || c.team?.name || '';
        if (c.homeAway === 'away') away = name;
        if (c.homeAway === 'home') home = name;
      }
      let time = 'TBD';
      if (event.date) {
        try {
          const d = new Date(event.date);
          time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
        } catch (e) {
          time = 'TBD';
        }
      }
      const status = event.status?.type?.description || '';
      if (status === 'Final') time = 'Final';
      if (status === 'In Progress') time = 'Live';
      const tv = comp.broadcasts?.[0]?.names?.[0] || '';
      if (away && home) {
        games.push({ away, home, date: dateStr, time, tv, note: '' });
      }
    }
    return NextResponse.json({ games, updated: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ games: [], updated: null });
  }
}
