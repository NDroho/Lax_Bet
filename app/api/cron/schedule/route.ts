import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

interface GameEntry {
  away: string;
  home: string;
  date: string;
  time: string;
  tv: string;
  note: string;
}

async function fetchESPN(dateStr: string): Promise<GameEntry[]> {
  const espnDate = dateStr.replace(/-/g, '');
  const slugs = ['mens-college-lacrosse', 'college-lacrosse'];

  for (const slug of slugs) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/lacrosse/${slug}/scoreboard?dates=${espnDate}`;
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 0 },
      });
      if (!res.ok) continue;

      const data = await res.json();
      if (!data.events || data.events.length === 0) continue;

      const games: GameEntry[] = [];
      for (const event of data.events) {
        const competition = event.competitions?.[0];
        if (!competition) continue;

        let away = '', home = '';
        for (const competitor of competition.competitors || []) {
          const teamName = competitor.team?.displayName || competitor.team?.shortDisplayName || competitor.team?.name || '';
          if (competitor.homeAway === 'away') away = teamName;
          else if (competitor.homeAway === 'home') home = teamName;
        }

        let time = 'TBD';
        if (event.date) {
          try {
            const d = new Date(event.date);
            time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
          } catch {}
        }
        if (event.status?.type?.description === 'Final') time = 'Final';
        if (event.status?.type?.description === 'In Progress') time = 'Live';

        const tv = competition.broadcasts?.[0]?.names?.[0] || '';
        const venue = competition.venue?.fullName || '';

        if (away && home) {
          games.push({ away, home, date: dateStr, time, tv, note: venue });
        }
      }

      console.log(`ESPN (${slug}): found ${games.length} games`);
      return games;
    } catch (err: any) {
      console.error(`ESPN (${slug}) error:`, err.message);
    }
  }
  return [];
}

async function fetchNCAA(dateStr: string): Promise<GameEntry[]> {
  const [year, month, day] = dateStr.split('-');
  const url = `https://data.ncaa.com/casablanca/scoreboard/lacrosse-men/d1/${year}/${month}/${day}/scoreboard.json`;

  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const games: GameEntry[] = [];

    for (const game of data.games || []) {
      const g = game.game || game;
      const away = g.away?.names?.short || g.away?.names?.full6Char || g.away?.school?.name || '';
      const home = g.home?.names?.short || g.home?.names?.full6Char || g.home?.school?.name || '';
      const time = g.startTime || 'TBD';
      const network = g.network || '';

      if (away && home) {
        games.push({ away, home, date: dateStr, time, tv: network, note: '' });
      }
    }

    console.log(`NCAA API: found ${games.length} games`);
    return games;
  } catch (err: any) {
    console.error('NCAA API error:', err.message);
    return [];
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    let games = await fetchESPN(dateStr);
    let source = 'espn-api';

    if (games.length === 0) {
      games = await fetchNCAA(dateStr);
      source = 'ncaa-api';
    }

    const seen = new Set<string>();
    const unique = games.filter(g => {
      const key = `${g.away}-${g.home}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    await kv.set('schedule', JSON.stringify(unique));
    await kv.set('schedule_updated', new Date().toISOString());

    return NextResponse.json({
      success: true,
      gamesCount: unique.length,
      source,
      date: dateStr,
      sampleGames: unique.slice(0, 3),
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
