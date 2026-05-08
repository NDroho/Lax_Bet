// app/api/backtest/route.ts
import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import {
  TeamStats,
  ModelWeights,
  DEFAULT_WEIGHTS,
  predictMatchup,
  getSOSTier,
  HomeField,
} from '@/lib/model';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// ─── TYPES ───────────────────────────────────────────────

export interface BacktestGame {
  date: string;
  awayEspn: string;
  homeEspn: string;
  awayScore: number;
  homeScore: number;
  awayMatched: string | null;
  homeMatched: string | null;
  modelHasData: boolean;
  // Spread
  predictedSpread: number;      // positive = away favored
  actualMargin: number;         // positive = away won
  spreadError: number;
  directionCorrect: boolean;
  // Total
  predictedTotal: number;
  actualTotal: number;
  totalError: number;
  // Win prob
  predictedWinProbAway: number;
  // Ratings
  ratingAway: number | null;
  ratingHome: number | null;
}

export interface BacktestSummary {
  totalGames: number;
  scoredGames: number;
  unmatchedGames: number;
  // Spread
  spreadMAE: number;
  spreadBias: number;
  directionAccuracy: number;
  directCorrect: number;
  // Total
  totalMAE: number;
  totalBias: number;
  // Cover %
  coverPct: number;             // how often model side covers a ±0.5 spread
  // By confidence tier
  strongGames: number;
  strongCorrect: number;
  leanGames: number;
  leanCorrect: number;
  tossupGames: number;
  tossupCorrect: number;
  games: BacktestGame[];
}

// ─── TEAM NAME MATCHING ──────────────────────────────────

const ALIASES: [string, string][] = [
  ['army', 'Army West Point'],
  ['cleveland state', 'Cleveland St.'],
  ['queens university', 'Queens (NC)'],
  ['long island university', 'LIU'],
  ['long island', 'LIU'],
  ['umass lowell', 'UMass Lowell'],
  ['mount st. mary', "Mount St. Mary's"],
  ['saint joseph', "Saint Joseph's"],
  ['st. bonaventure', 'St. Bonaventure'],
];

function norm(s: string): string {
  return s.toLowerCase()
    .replace(/\bu\.\s*/g, 'university ')
    .replace(/\bstate\b/g, 'st')
    .replace(/\bst\.\s*/g, 'st ')
    .trim();
}

const MASCOTS = [
  'black knights','blue jays','scarlet knights','tar heels','orange','orangemen',
  'cavaliers','fighting irish','big green','terriers','crimson','hoyas','pioneers',
  'retrievers','bulldogs','bears','tigers','lions','eagles','hawks','cardinals',
  'wildcats','wolverines','aggies','huskies','panthers','rams','red storm',
  'wolfpack','demon deacons','yellow jackets','greyhounds','jaspers','warriors',
  'seahawks','vikings','colonials','keydets','bobcats','royals','dolphins','sharks',
  'lakers','river hawks','titans','falcons','knights','golden eagles','statesmen',
  'blue hens','red foxes','seawolves','bonnies','gaels','golden griffins','stags',
  'pride','crusaders','midshipmen','big red','quakers','minutemen','buckeyes',
  'terrapins','catamounts','spiders','saints','great danes','raiders','leopards',
  'bearcats','mounties','mountaineers','highlanders','bison','pirates','utes',
  'dragons','nittany lions',
];

function stripMascot(s: string): string {
  const pattern = new RegExp(`\\s+(${MASCOTS.join('|')})$`, 'i');
  return s.replace(pattern, '').trim();
}

function findTeamName(espnName: string, teams: TeamStats[]): string | null {
  if (!espnName) return null;
  const lower = espnName.toLowerCase();

  // Alias table first
  const sortedAliases = [...ALIASES].sort((a, b) => b[0].length - a[0].length);
  for (const [alias, kvName] of sortedAliases) {
    if (lower.includes(alias)) {
      const match = teams.find(t => t.name === kvName);
      if (match) return match.name;
    }
  }

  // Exact match
  const exact = teams.find(t => t.name.toLowerCase() === lower);
  if (exact) return exact.name;

  const espnNorm = norm(lower);
  const espnSchool = norm(stripMascot(lower));

  function bestMatch(candidates: { team: TeamStats; score: number }[]): string | null {
    if (candidates.length === 0) return null;
    const best = new Map<string, { team: TeamStats; score: number }>();
    for (const c of candidates) {
      const existing = best.get(c.team.name);
      if (!existing || c.score > existing.score) best.set(c.team.name, c);
    }
    return [...best.values()].sort((a, b) => b.score - a.score)[0].team.name;
  }

  const substringMatches: { team: TeamStats; score: number }[] = [];
  for (const t of teams) {
    const tn = norm(t.name.toLowerCase());
    if (espnNorm.includes(tn) || tn.includes(espnNorm)) {
      substringMatches.push({ team: t, score: tn.length });
    }
  }
  const subResult = bestMatch(substringMatches);
  if (subResult) return subResult;

  const schoolMatches: { team: TeamStats; score: number }[] = [];
  for (const t of teams) {
    const tn = norm(t.name.toLowerCase());
    if (espnSchool.includes(tn) || tn.includes(espnSchool)) {
      schoolMatches.push({ team: t, score: tn.length });
    }
    const tSchool = norm(stripMascot(t.name.toLowerCase()));
    if (tSchool && (espnSchool.includes(tSchool) || tSchool.includes(espnSchool))) {
      schoolMatches.push({ team: t, score: tSchool.length });
    }
  }
  return bestMatch(schoolMatches);
}

// ─── ESPN FETCH ──────────────────────────────────────────

interface ESPNGame {
  awayName: string;
  homeName: string;
  awayScore: number;
  homeScore: number;
  date: string;
}

async function fetchCompletedGames(dateStr: string): Promise<ESPNGame[]> {
  // dateStr: YYYYMMDD
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/lacrosse/mens-college-lacrosse/scoreboard?dates=${dateStr}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const games: ESPNGame[] = [];

    for (const event of data.events || []) {
      const status = event.status?.type?.description || '';
      // Only completed games
      if (status !== 'Final' && status !== 'Final/OT' && status !== 'Final/2OT') continue;

      const comp = event.competitions?.[0];
      if (!comp) continue;

      let awayName = '';
      let homeName = '';
      let awayScore = 0;
      let homeScore = 0;

      for (const c of comp.competitors || []) {
        const name = c.team?.displayName || c.team?.shortDisplayName || c.team?.name || '';
        const score = parseInt(c.score || '0', 10);
        if (c.homeAway === 'away') { awayName = name; awayScore = score; }
        if (c.homeAway === 'home') { homeName = name; homeScore = score; }
      }

      if (awayName && homeName && (awayScore + homeScore) > 0) {
        const displayDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
        games.push({ awayName, homeName, awayScore, homeScore, date: displayDate });
      }
    }
    return games;
  } catch {
    return [];
  }
}

// ─── DATE RANGE ──────────────────────────────────────────

function dateRange(startYYYYMMDD: string, endYYYYMMDD: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = [
    parseInt(startYYYYMMDD.slice(0, 4)),
    parseInt(startYYYYMMDD.slice(4, 6)) - 1,
    parseInt(startYYYYMMDD.slice(6, 8)),
  ];
  const [ey, em, ed] = [
    parseInt(endYYYYMMDD.slice(0, 4)),
    parseInt(endYYYYMMDD.slice(4, 6)) - 1,
    parseInt(endYYYYMMDD.slice(6, 8)),
  ];
  const cur = new Date(sy, sm, sd);
  const end = new Date(ey, em, ed);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}${m}${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ─── CONCURRENT FETCH WITH LIMIT ─────────────────────────

async function fetchWithConcurrency<T>(
  items: string[],
  fn: (item: string) => Promise<T[]>,
  concurrency = 8,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    for (const r of batchResults) results.push(...r);
  }
  return results;
}

// ─── MAIN HANDLER ────────────────────────────────────────

export async function GET(request: Request) {
  try {
    // Load teams from KV
    const raw = await kv.get<string>('teams');
    if (!raw) {
      return NextResponse.json({ error: 'No team stats in KV. Run /api/cron/stats first.' }, { status: 400 });
    }
    const teams: TeamStats[] = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!teams || teams.length === 0) {
      return NextResponse.json({ error: 'Team stats empty.' }, { status: 400 });
    }

    // Date range: Feb 1 2026 → yesterday (current stats already include today's games)
    const now = new Date();
    const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    eastern.setDate(eastern.getDate() - 1); // yesterday
    const endDate = `${eastern.getFullYear()}${String(eastern.getMonth() + 1).padStart(2, '0')}${String(eastern.getDate()).padStart(2, '0')}`;
    const startDate = '20260201';

    const dates = dateRange(startDate, endDate);

    // Fetch all completed games across the season
    const allESPNGames = await fetchWithConcurrency(dates, fetchCompletedGames, 10);

    // Deduplicate (same game can appear if fetched on multiple dates due to late finishes)
    const seen = new Set<string>();
    const uniqueGames: ESPNGame[] = [];
    for (const g of allESPNGames) {
      const key = `${g.date}|${g.awayName}|${g.homeName}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueGames.push(g);
      }
    }

    // Run predictions
    const weights: ModelWeights = DEFAULT_WEIGHTS;
    const backtestGames: BacktestGame[] = [];

    for (const g of uniqueGames) {
      const awayMatched = findTeamName(g.awayName, teams);
      const homeMatched = findTeamName(g.homeName, teams);
      const awayTeam = awayMatched ? teams.find(t => t.name === awayMatched) ?? null : null;
      const homeTeam = homeMatched ? teams.find(t => t.name === homeMatched) ?? null : null;

      const modelHasData = !!(awayTeam && homeTeam);
      const actualMargin = g.awayScore - g.homeScore;
      const actualTotal = g.awayScore + g.homeScore;

      let predictedSpread = 0;
      let predictedTotal = 0;
      let spreadError = 0;
      let totalError = 0;
      let directionCorrect = false;
      let predictedWinProbAway = 0.5;
      let ratingAway: number | null = null;
      let ratingHome: number | null = null;

      if (modelHasData && awayTeam && homeTeam) {
        const pred = predictMatchup(awayTeam, homeTeam, weights, true, 'B');
        predictedSpread = pred.spread;
        predictedTotal = pred.projTotal;
        predictedWinProbAway = pred.winProbA;
        ratingAway = pred.ratingA;
        ratingHome = pred.ratingB;
        spreadError = Math.abs(predictedSpread - actualMargin);
        totalError = Math.abs(predictedTotal - actualTotal);
        // Direction: did we pick the right winner?
        directionCorrect =
          (predictedSpread > 0 && actualMargin > 0) ||
          (predictedSpread < 0 && actualMargin < 0) ||
          (predictedSpread === 0); // pick = don't penalize
      }

      backtestGames.push({
        date: g.date,
        awayEspn: g.awayName,
        homeEspn: g.homeName,
        awayScore: g.awayScore,
        homeScore: g.homeScore,
        awayMatched,
        homeMatched,
        modelHasData,
        predictedSpread,
        actualMargin,
        spreadError,
        directionCorrect,
        predictedTotal,
        actualTotal,
        totalError,
        predictedWinProbAway,
        ratingAway,
        ratingHome,
      });
    }

    // Sort by date descending
    backtestGames.sort((a, b) => b.date.localeCompare(a.date));

    // Summary stats
    const scored = backtestGames.filter(g => g.modelHasData);
    const unmatched = backtestGames.filter(g => !g.modelHasData);

    const spreadMAE = scored.length > 0
      ? scored.reduce((s, g) => s + g.spreadError, 0) / scored.length
      : 0;
    const spreadBias = scored.length > 0
      ? scored.reduce((s, g) => s + (g.predictedSpread - g.actualMargin), 0) / scored.length
      : 0;
    const directCorrect = scored.filter(g => g.directionCorrect).length;
    const directionAccuracy = scored.length > 0 ? directCorrect / scored.length : 0;

    const totalMAE = scored.length > 0
      ? scored.reduce((s, g) => s + g.totalError, 0) / scored.length
      : 0;
    const totalBias = scored.length > 0
      ? scored.reduce((s, g) => s + (g.predictedTotal - g.actualTotal), 0) / scored.length
      : 0;

    // Cover % — did model-favored side cover a flat ±0.5 line?
    const coverGames = scored.filter(g => g.predictedSpread !== 0);
    const coverHits = coverGames.filter(g => {
      if (g.predictedSpread > 0) return g.actualMargin > 0.5;  // model likes away
      return g.actualMargin < -0.5;                              // model likes home
    });
    const coverPct = coverGames.length > 0 ? coverHits.length / coverGames.length : 0;

    // By confidence tier
    // confidence = Math.min(95, Math.round(Math.abs(diff) * 4 + 35))
    // STRONG >= 70, LEAN 50-69, TOSS-UP < 50
    // Re-derive confidence from rating differential since we stored ratings
    function getConfidence(g: BacktestGame): number {
      if (g.ratingAway == null || g.ratingHome == null) return 35;
      const diff = Math.abs(g.ratingAway - g.ratingHome);
      return Math.min(95, Math.round(diff * 4 + 35));
    }

    const strong = scored.filter(g => getConfidence(g) >= 70);
    const lean = scored.filter(g => { const c = getConfidence(g); return c >= 50 && c < 70; });
    const tossup = scored.filter(g => getConfidence(g) < 50);

    const summary: BacktestSummary = {
      totalGames: backtestGames.length,
      scoredGames: scored.length,
      unmatchedGames: unmatched.length,
      spreadMAE,
      spreadBias,
      directionAccuracy,
      directCorrect,
      totalMAE,
      totalBias,
      coverPct,
      strongGames: strong.length,
      strongCorrect: strong.filter(g => g.directionCorrect).length,
      leanGames: lean.length,
      leanCorrect: lean.filter(g => g.directionCorrect).length,
      tossupGames: tossup.length,
      tossupCorrect: tossup.filter(g => g.directionCorrect).length,
      games: backtestGames,
    };

    return NextResponse.json(summary);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
