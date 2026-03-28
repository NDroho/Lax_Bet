import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { kv } from '@vercel/kv';

const LACROSSE_REF_URL = 'https://lacrossereference.com/game-win-probabilities-d1-men/';
const NCAA_URL = 'https://www.ncaa.com/scoreboard/lacrosse-men/d1';

interface GameEntry {
  away: string; home: string; date: string; time: string; tv: string; note: string;
}

async function scrapeLacrosseRef(): Promise<GameEntry[]> {
  try {
    const res = await fetch(LACROSSE_REF_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const games: GameEntry[] = [];

    // Strategy 1: table rows
    $('table tr, .game-row, .matchup').each((_, el) => {
      const text = $(el).text();
      const vsMatch = text.match(/([A-Z][A-Za-z\s.&'-]+?)\s+(?:vs\.?|at|@)\s+([A-Z][A-Za-z\s.&'-]+)/);
      if (vsMatch) {
        const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|a\.m\.|p\.m\.))/i);
        games.push({ away: vsMatch[1].trim(), home: vsMatch[2].trim(), date: new Date().toLocaleDateString(), time: timeMatch ? timeMatch[1] : 'TBD', tv: '', note: '' });
      }
    });

    // Strategy 2: line-by-line text
    if (games.length === 0) {
      const lines = $('body').text().split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const vsMatch = line.match(/^([A-Z][A-Za-z\s.&'-]{2,30}?)\s+(?:vs\.?|at|@)\s+([A-Z][A-Za-z\s.&'-]{2,30})/);
        if (vsMatch) {
          const timeMatch = line.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
          const away = vsMatch[1].trim();
          const home = vsMatch[2].trim();
          if (away.length > 2 && home.length > 2 && !away.includes('http')) {
            games.push({ away, home, date: new Date().toLocaleDateString(), time: timeMatch ? timeMatch[1] : 'TBD', tv: '', note: '' });
          }
        }
      }
    }
    return games;
  } catch { return []; }
}

async function scrapeNCAA(): Promise<GameEntry[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const res = await fetch(`${NCAA_URL}/${today}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    const games: GameEntry[] = [];

    $('.gamePod, .game-pod, [class*="game"]').each((_, el) => {
      const teams = $(el).find('.team-name, .gamePod-game-team-name, [class*="team-name"]');
      if (teams.length >= 2) {
        const away = $(teams[0]).text().trim();
        const home = $(teams[1]).text().trim();
        const time = $(el).find('.game-time, .gamePod-game-status, [class*="time"]').first().text().trim();
        if (away && home) games.push({ away, home, date: today, time: time || 'TBD', tv: '', note: '' });
      }
    });
    return games;
  } catch { return []; }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let games = await scrapeLacrosseRef();
    if (games.length === 0) games = await scrapeNCAA();

    const seen = new Set<string>();
    const unique = games.filter(g => {
      const key = `${g.away}-${g.home}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    await kv.set('schedule', JSON.stringify(unique));
    await kv.set('schedule_updated', new Date().toISOString());

    return NextResponse.json({ success: true, gamesCount: unique.length, updatedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
