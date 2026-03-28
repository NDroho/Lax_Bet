import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { kv } from '@vercel/kv';
 
interface GameEntry {
  away: string;
  home: string;
  date: string;
  time: string;
  tv: string;
  note: string;
}
 
function cleanTeamName(raw: string): string {
  return raw
    .replace(/\d+$/, '')               // remove trailing score numbers
    .replace(/\(\d+-\d+\)/, '')        // remove (W-L) records
    .replace(/^\d+\s*/, '')            // remove leading rank numbers
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();
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
 
    // ESPN's scoreboard HTML includes game data in the text even though
    // the visual layout is JS-rendered. The pattern in the raw text is:
    // [rank] TeamName (W-L) [quarter scores...] TotalScore
    // repeated twice per game (away team then home team)
 
    const bodyText = $('body').text();
 
    // Extract all team entries: optional rank, team name, (record)
    // Pattern: captures text blocks that look like team entries
    const teamPattern = /(\d{1,2}\s+)?([A-Z][a-zA-Z\s.&'()-]+?)\s+\((\d+-\d+)\)/g;
    const entries: { name: string; record: string }[] = [];
    let match;
 
    while ((match = teamPattern.exec(bodyText)) !== null) {
      const name = cleanTeamName(match[2]);
      const record = match[3];
      // Filter out non-team strings
      if (name.length > 2 && name.length < 35 && !name.includes('Copyright') && !name.includes('ESPN')) {
        entries.push({ name, record });
      }
    }
 
    // Pair entries as away/home (ESPN lists away first, then home)
    for (let i = 0; i < entries.length - 1; i += 2) {
      const away = entries[i];
      const home = entries[i + 1];
      if (away.name !== home.name) {
        games.push({
          away: away.name,
          home: home.name,
          date: today.toLocaleDateString(),
          time: 'TBD',
          tv: '',
          note: '',
        });
      }
    }
 
    console.log(`ESPN: parsed ${entries.length} team entries into ${games.length} games`);
    return games;
  } catch (err: any) {
    console.error('ESPN scrape failed:', err.message);
    return [];
  }
}
 
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
 
  try {
    const games = await scrapeESPN();
 
    // Deduplicate
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
      source: 'espn',
      sampleGames: unique.slice(0, 3),
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
