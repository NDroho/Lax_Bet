// ─── TYPES ───

export interface TeamStats {
  name: string;
  conf: string;
  w: number;
  l: number;
  foWin: number;
  clearPct: number;
  shotPct: number;
  savePct: number;
  scoringOff: number;
  scoringDef: number;
  turnoversPerGame: number;
  causedTurnoversPerGame: number;
  manUpPct: number;
  manDownPct: number;
  oppShotPct: number;
  lastUpdated?: string;
  rating?: number;
}

export interface ModelWeights {
  faceOff: number;
  clearPct: number;
  shotPct: number;
  turnoverMargin: number;
  savePct: number;
  defEff: number;
  emo: number;
  [key: string]: number;
}

export interface SlateGame {
  away: string;
  home: string;
  date: string;
  time: string;
  tv: string;
  note: string;
}

export interface Prediction {
  ratingA: number;
  ratingB: number;
  spread: number;
  winProbA: number;
  projTotal: number;
  confidence: number;
  mlValue: boolean;
}

// ─── DEFAULT WEIGHTS (v2 — optimized April 4, 2026) ───
// Backtested against 33 games. Avg spread error: ±5.3 pts
// Key insight: turnover margin and shooting efficiency dominate;
// faceoff win % is near-zero signal for predicting margins.

export const DEFAULT_WEIGHTS: ModelWeights = {
  faceOff: 2,
  clearPct: 15,
  shotPct: 23,
  turnoverMargin: 29,
  savePct: 7,
  defEff: 3,
  emo: 13,
};

// ─── SPREAD SCALAR ───
// Controls how power rating differential converts to point spread.
// v1 was 0.25, v2 optimized to 0.30.
const SPREAD_SCALAR = 0.30;

// ─── SOS TIER SYSTEM ───

export type SOSTier = 'elite' | 'strong' | 'ranked' | 'above_avg' | 'average' | 'weak';

export interface SOSTierInfo {
  tier: SOSTier;
  label: string;
  multiplier: number;
  color: string;
}

// v2 SOS multipliers — significantly wider gap than v1.
// Elite teams' stats are boosted 30%, weak teams' stats penalized 35%.
// This corrects for schedule-inflated stats (e.g. Vermont's faceoff %
// was earned against America East; Princeton's was earned against Ivy).
export const SOS_TIERS: Record<SOSTier, SOSTierInfo> = {
  elite:     { tier: 'elite',     label: 'Elite',     multiplier: 1.300, color: '#22c55e' },
  strong:    { tier: 'strong',    label: 'Strong',    multiplier: 1.120, color: '#3b82f6' },
  ranked:    { tier: 'ranked',    label: 'Ranked',    multiplier: 1.045, color: '#8b5cf6' },
  above_avg: { tier: 'above_avg', label: 'Above Avg', multiplier: 0.930, color: '#eab308' },
  average:   { tier: 'average',   label: 'Average',   multiplier: 0.825, color: '#a1a1aa' },
  weak:      { tier: 'weak',      label: 'Weak',      multiplier: 0.650, color: '#ef4444' },
};

// Manual SOS tier assignments based on RPI, poll rankings, and win%
// Updated through games April 2, 2026
// TODO: auto-populate from RPI scraping in the stats cron
const SOS_TEAM_MAP: Record<string, SOSTier> = {
  // Elite — RPI top ~10 or equivalent
  'Princeton': 'elite',
  'North Carolina': 'elite',
  'Syracuse': 'elite',
  'Harvard': 'elite',
  'Notre Dame': 'elite',
  'Ohio State': 'elite',
  'Ohio St.': 'elite',
  'Richmond': 'elite',
  'Penn State': 'elite',
  'Penn St.': 'elite',
  'Villanova': 'elite',
  'Johns Hopkins': 'elite',
  'Virginia': 'elite',
  'Yale': 'elite',

  // Strong — RPI ~11-25
  'Rutgers': 'strong',
  'Cornell': 'strong',
  'Duke': 'strong',
  'Maryland': 'strong',
  'Penn': 'strong',
  'Pennsylvania': 'strong',
  'Towson': 'strong',
  'Army West Point': 'strong',
  'Army': 'strong',
  'Navy': 'strong',

  // Ranked — In poll top 20 but no confirmed top-25 RPI
  'Georgetown': 'ranked',
  'Saint Joseph\'s': 'ranked',
  'St. Joseph\'s': 'ranked',
  'Loyola Maryland': 'ranked',
  'Loyola (MD)': 'ranked',

  // Above Average — 60%+ win rate or strong conference
  'Denver': 'above_avg',
  'Stony Brook': 'above_avg',
  'Drexel': 'above_avg',
  'Brown': 'above_avg',
  'High Point': 'above_avg',
  'Marquette': 'above_avg',
  'Colgate': 'above_avg',
  // Hofstra moved to weak (0.222 win%)
  'UAlbany': 'above_avg',
  'Albany': 'above_avg',
  'Bryant': 'above_avg',

  // Average — 40-59% win rate
  'Monmouth': 'average',
  'Marist': 'average',
  'Sacred Heart': 'average',
  'Bucknell': 'average',
  'Lafayette': 'average',
  'Dartmouth': 'average',
  'Providence': 'average',
  'Fairfield': 'average',
  'Vermont': 'average',
  'Le Moyne': 'average',
  'Robert Morris': 'average',
  'Cleveland State': 'average',
  'Cleveland St.': 'average',
  'Long Island University': 'average',
  'LIU': 'average',
  'Utah': 'average',
  'Boston University': 'average',
  'Boston U.': 'average',
  'Lehigh': 'average',

  // Weak — sub-40% win rate or bottom-tier conference
  'NJIT': 'weak',
  'Hampton': 'weak',
  'Wagner': 'weak',
  'VMI': 'weak',
  'Mercer': 'weak',
  'Queens University': 'weak',
  'Queens (NC)': 'weak',
  'Jacksonville': 'weak',
  'Detroit Mercy': 'weak',
  'UMass Lowell': 'weak',
  'St. John\'s': 'weak',
  'St. John\'s (NY)': 'weak',
  'Hofstra': 'weak',
  'Binghamton': 'weak',
  'St. Bonaventure': 'weak',
  'Bellarmine': 'weak',
  'Air Force': 'weak',
  'Hobart': 'weak',
  'Hobart College': 'weak',
  'Delaware': 'weak',
  'Michigan': 'weak',
  'Quinnipiac': 'weak',
  'Iona': 'weak',
  'Manhattan': 'weak',
  'Mount St. Mary\'s': 'weak',
  'Mt. St. Mary\'s': 'weak',
  'Merrimack': 'weak',
  'Canisius': 'weak',
  'UMBC': 'weak',
  'Holy Cross': 'weak',
  'Siena': 'weak',
  'Mercyhurst': 'weak',
};

export function getSOSTier(teamName: string): SOSTierInfo {
  const tier = SOS_TEAM_MAP[teamName];
  if (tier) return SOS_TIERS[tier];
  // Default: average if unknown
  return SOS_TIERS.average;
}

// ─── NORMALIZATION ───

const STAT_RANGES = {
  faceOff: { min: 0.35, max: 0.70 },
  clearPct: { min: 0.80, max: 0.96 },
  shotPct: { min: 0.20, max: 0.38 },
  turnoverMargin: { min: -6, max: 6 },
  savePct: { min: 0.45, max: 0.62 },
  defEff: { min: 0.20, max: 0.35 },
  emo: { min: 0.15, max: 0.60 },
};

function normalize(val: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

// ─── POWER RATING ───

export function computePowerRating(team: TeamStats, weights: ModelWeights, sosMultiplier: number = 1.0): number {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const turnoverMargin = team.causedTurnoversPerGame - team.turnoversPerGame;
  const emoComposite = (team.manUpPct + team.manDownPct) / 2;

  const scores: Record<string, number> = {
    faceOff: normalize(team.foWin, STAT_RANGES.faceOff.min, STAT_RANGES.faceOff.max),
    clearPct: normalize(team.clearPct, STAT_RANGES.clearPct.min, STAT_RANGES.clearPct.max),
    shotPct: normalize(team.shotPct, STAT_RANGES.shotPct.min, STAT_RANGES.shotPct.max),
    turnoverMargin: normalize(turnoverMargin, STAT_RANGES.turnoverMargin.min, STAT_RANGES.turnoverMargin.max),
    savePct: normalize(team.savePct, STAT_RANGES.savePct.min, STAT_RANGES.savePct.max),
    defEff: 1 - normalize(team.oppShotPct, STAT_RANGES.defEff.min, STAT_RANGES.defEff.max),
    emo: normalize(emoComposite, STAT_RANGES.emo.min, STAT_RANGES.emo.max),
  };

  let rating = 0;
  for (const key of Object.keys(weights)) {
    rating += (scores[key] || 0) * (weights[key] / totalWeight);
  }

  // Apply SOS multiplier to the final rating
  rating *= sosMultiplier;

  return Math.round(rating * 1000) / 10;
}

// ─── MATCHUP PREDICTION ───

export function predictMatchup(teamA: TeamStats, teamB: TeamStats, weights: ModelWeights, useSOS: boolean = true): Prediction {
  const sosA = useSOS ? getSOSTier(teamA.name).multiplier : 1.0;
  const sosB = useSOS ? getSOSTier(teamB.name).multiplier : 1.0;

  const ratingA = computePowerRating(teamA, weights, sosA);
  const ratingB = computePowerRating(teamB, weights, sosB);
  const diff = ratingA - ratingB;

  // v2: spread scalar 0.30 (was 0.25 in v1)
  const rawSpread = diff * SPREAD_SCALAR;
  const spread = Math.round(rawSpread * 2) / 2;
  const winProbA = 1 / (1 + Math.exp(-diff * 0.15));

  const avgOff = (teamA.scoringOff + teamB.scoringOff) / 2;
  const avgDef = (teamA.scoringDef + teamB.scoringDef) / 2;
  const paceAdj = ((teamA.foWin + teamB.foWin) / 2 - 0.5) * 2;
  const projTotal = Math.round((avgOff + avgDef + paceAdj) * 2) / 2;

  const confidence = Math.min(95, Math.round(Math.abs(diff) * 4 + 35));
  const mlValue = Math.abs(winProbA - 0.5) > 0.15;

  return { ratingA, ratingB, spread, winProbA, projTotal, confidence, mlValue };
}

// ─── AMERICAN ODDS CONVERSION ───

export function probToAmericanOdds(prob: number): string {
  if (prob <= 0 || prob >= 1) return 'N/A';
  const p = Math.max(0.03, Math.min(0.97, prob));
  if (p >= 0.5) {
    const odds = Math.round(-(p / (1 - p)) * 100);
    return `${odds}`;
  } else {
    const odds = Math.round(((1 - p) / p) * 100);
    return `+${odds}`;
  }
}

export type ConfidenceTier = 'STRONG' | 'LEAN' | 'TOSS-UP';

export function getConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 70) return 'STRONG';
  if (confidence >= 50) return 'LEAN';
  return 'TOSS-UP';
}
