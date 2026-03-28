import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { kv } from '@vercel/kv';

interface GameEntry {
  away: string; home: string; date: string; time: string; tv: string; note: string;
}

async function scrapeESPN(): Promise<GameEntry[]> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const url = `https://www.espn.com/mens-college-lacrosse/scoreboard/_/date/${dateStr}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const games: GameEntry[] = [];

    // ESPN pairs team names within game containers
    const teamNames: string[] = [];
    $('[class*="TeamName"], [class*="team-name"], .ScoreboardScoreCell__Item').each((_, el) => {
      const name = $(el).text().trim();
      if (name && name.length > 1 && name.length < 40) teamNames.push(name);
    });
    for (let i = 0; i < teamNames.length - 1; i += 2) {
      games.push({ away: teamNames[i], home: teamNames[i + 1], date: today.toLocaleDateString(), time: 'TBD', tv: '', note: '' });
    }

    // Fallback: parse "(record)" pattern from text
    if (games.length === 0) {
      const bodyText = $('body').text();
      const teamMatches = bodyText.match(/([A-Z][a-zA-Z\s.&'-]{2,25}?)\s+\(\d+-\d+\)/g);
      if (teamMatches && teamMatches.length >= 2) {
        for (let i = 0; i < teamMatches.length - 1; i += 2) {
          const away = teamMatches[i].replace(/\s*\(\d+-\d+\)/, '').trim();
          const home = teamMatches[i + 1].replace(/\s*\(\d+-\d+\)/, '').trim();
          if (away && home) games.push({ away, home, date: today.toLocaleDateString(), time: 'TBD', tv: '', note: '' });
        }
      }
    }

    console.log(`ESPN: found ${games.length} games`);
    return games;
  } catch (err: any) {
    console.error('ESPN scrape failed:', err.message);
    return [];
  }
}

async function scrapeInsideLacrosse(): Promise<GameEntry[]> {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const url = `https://www.insidelacrosse.com/ncaa/m/1/2026/scores?date=${dateStr}&autoload=1`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`IL HTTP ${res.status}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const games: GameEntry[] = [];

    $('[class*="game"], [class*="matchup"], [class*="score"], tr').each((_, el) => {
      const text = $(el).text();
      const vsMatch = text.match(/([A-Z][A-Za-z\s.&'-]+?)\s+(?:vs\.?|at|@|v)\s+([A-Z][A-Za-z\s.&'-]+)/);
      if (vsMatch) {
        const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
        games.push({ away: vsMatch[1].trim(), home: vsMatch[2].trim(), date: today.toLocaleDateString(), time: timeMatch ? timeMatch[1] : 'TBD', tv: '', note: '' });
      }
    });

    console.log(`InsideLacrosse: found ${games.length} games`);
    return games;
  } catch (err: any) {
    console.error('InsideLacrosse scrape failed:', err.message);
    return [];
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let games = await scrapeESPN();
    let source = 'espn';

    if (games.length === 0) {
      games = await scrapeInsideLacrosse();
      source = 'insidelacrosse';
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

    return NextResponse.json({ success: true, gamesCount: unique.length, source, updatedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
