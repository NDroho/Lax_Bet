import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { kv } from '@vercel/kv';

// VERIFIED NCAA team stat page IDs (as of March 2026)
const STAT_PAGES: { id: string; key: string; pctField?: boolean }[] = [
  { id: '230', key: 'foWin', pctField: true },           // Face-Off Winning Percentage
  { id: '563', key: 'shotPct', pctField: true },          // Shot Percentage
  { id: '229', key: 'scoringDef' },                       // Scoring Defense (goals against/game)
  { id: '228', key: 'scoringOff' },                       // Scoring Offense (goals/game)
  { id: '231', key: 'manUpPct', pctField: true },         // Man-Up Offense
  { id: '232', key: 'manDownPct', pctField: true },       // Man-Down Defense
  { id: '838', key: 'clearPct', pctField: true },         // Clearing Percentage (was 227 - WRONG)
  { id: '559', key: 'turnoversPerGame' },                 // Turnovers Per Game (was 234 - WRONG)
  { id: '561', key: 'causedTurnoversPerGame' },           // Caused Turnovers Per Game (was 233 - WRONG)
  { id: '536', key: 'savesPerGame' },                     // Saves Per Game (was 209/savePct - WRONG)
  { id: '538', key: 'groundBallsPerGame' },               // Ground Balls Per Game (new)
  { id: '233', key: 'winPct', pctField: true },           // Winning Percentage (new - gives W-L record)
  { id: '238', key: 'scoringMargin' },                    // Scoring Margin (new)
];

async function fetchStat(statId: string, pctField: boolean = false) {
  const url = `https://www.ncaa.com/stats/lacrosse-men/d1/current/team/${statId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.error(`HTTP ${res.status} for stat ${statId}`);
      return {};
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const results: Record<string, number> = {};

    $('table tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;

      // Find team name (look for a cell with text that isn't a number)
      let teamName = '';
      for (let c = 0; c < Math.min(cells.length, 3); c++) {
        const candidate = $(cells[c]).find('a').text().trim() || $(cells[c]).text().trim();
        if (candidate && isNaN(Number(candidate)) && candidate.length > 1) {
          teamName = candidate;
          break;
        }
      }
      if (!teamName) return;

      // Get the last numeric cell as the stat value
      let val = NaN;
      for (let c = cells.length - 1; c >= 0; c--) {
        const text = $(cells[c]).text().trim();
        const num = parseFloat(text);
        if (!isNaN(num)) { val = num; break; }
      }

      if (!isNaN(val)) {
        if (pctField && val > 1) val = val / 100;
        results[teamName] = val;
      }
    });

    console.log(`Stat ${statId}: parsed ${Object.keys(results).length} teams`);
    return results;
  } catch (err: any) {
    console.error(`Error fetching stat ${statId}:`, err.message);
    return {};
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const allStats: Record<string, Record<string, number>> = {};
    const statResults: Record<string, number> = {};

    for (const stat of STAT_PAGES) {
      const data = await fetchStat(stat.id, stat.pctField);
      statResults[stat.key] = Object.keys(data).length;

      for (const [team, val] of Object.entries(data)) {
        if (!allStats[team]) allStats[team] = {};
        allStats[team][stat.key] = val;
      }

      // Rate limit between NCAA requests
      await new Promise(r => setTimeout(r, 1500));
    }

    // Build team objects
    const teams = Object.entries(allStats)
      .filter(([_, stats]) => Object.keys(stats).length >= 3)
      .map(([name, stats]) => {
        // Calculate save percentage from saves/game and goals against/game
        // savePct = saves / (saves + goals against)
        const savesPerGame = stats.savesPerGame ?? 0;
        const goalsConceded = stats.scoringDef ?? 11;
        const calculatedSavePct = savesPerGame > 0
          ? savesPerGame / (savesPerGame + goalsConceded)
          : 0.53; // fallback

        // Estimate opponent shot % from scoring defense and save %
        // If we know goals against and save %, we can estimate shots against
        // shots against = goals against / (1 - save%)
        // opp shot % = goals against / shots against = 1 - save%
        // This is a rough approximation
        const estimatedOppShotPct = calculatedSavePct > 0
          ? 1 - calculatedSavePct
          : 0.28;

        return {
          name,
          conf: '',
          w: 0,
          l: 0,
          foWin: stats.foWin ?? 0.50,
          clearPct: stats.clearPct ?? 0.90,
          shotPct: stats.shotPct ?? 0.28,
          savePct: calculatedSavePct,
          scoringOff: stats.scoringOff ?? 12,
          scoringDef: stats.scoringDef ?? 11,
          turnoversPerGame: stats.turnoversPerGame ?? 9,
          causedTurnoversPerGame: stats.causedTurnoversPerGame ?? 7,
          manUpPct: stats.manUpPct ?? 0.35,
          manDownPct: stats.manDownPct != null
            ? (stats.manDownPct > 0.5 ? stats.manDownPct : 1 - stats.manDownPct)
            : 0.72,
          oppShotPct: estimatedOppShotPct,
          groundBallsPerGame: stats.groundBallsPerGame ?? 0,
          scoringMargin: stats.scoringMargin ?? 0,
          winPct: stats.winPct ?? 0,
          lastUpdated: new Date().toISOString(),
        };
      });

    await kv.set('teams', JSON.stringify(teams));
    await kv.set('teams_updated', new Date().toISOString());

    return NextResponse.json({
      success: true,
      teamsCount: teams.length,
      statResults,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Stats cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
