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

// ─── DEFAULT WEIGHTS ───

export const DEFAULT_WEIGHTS: ModelWeights = {
  faceOff: 22,
  clearPct: 15,
  shotPct: 16,
  turnoverMargin: 20,
  savePct: 12,
  defEff: 10,
  emo: 5,
};

// ─── SOS TIER SYSTEM ───

export type SOSTier = 'elite' | 'strong' | 'ranked' | 'above_avg' | 'average' | 'weak';

export interface SOSTierInfo {
  tier: SOSTier;
  label: string;
  multiplier: number;
  color: string;
}

export const SOS_TIERS: Record<SOSTier, SOSTierInfo> = {
  elite:     { tier: 'elite',     label: 'Elite',     multiplier: 1.08, color: '#22c55e' },
  strong:    { tier: 'strong',    label: 'Strong',    multiplier: 1.03, color: '#3b82f6' },
  ranked:    { tier: 'ranked',    label: 'Ranked',    multiplier: 1.01, color: '#8b5cf6' },
  above_avg: { tier: 'above_avg', label: 'Above Avg', multiplier: 0.98, color: '#eab308' },
  average:   { tier: 'average',   label: 'Average',   multiplier: 0.95, color: '#a1a1aa' },
  weak:      { tier: 'weak',      label: 'Weak',      multiplier: 0.88, color: '#ef4444' },
};

// Manual SOS tier assignments based on RPI, poll rankings, and win%
// Updated through games March 31, 2026
// This map will eventually be auto-populated by the stats cron via RPI scraping
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
  'Villanova': 'elite',
  'Johns Hopkins': 'elite',

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
  'Boston University': 'ranked',
  'Boston U.': 'ranked',
  'Denver': 'ranked',
  'Virginia': 'ranked',

  // Above average — 60%+ win rate, not ranked
  'Sacred Heart': 'above_avg',
  'Siena': 'above_avg',
  'Long Island University': 'above_avg',
  'LIU': 'above_avg',
  'Robert Morris': 'above_avg',
  'UAlbany': 'above_avg',
  'Albany': 'above_avg',
  'UMass': 'above_avg',
  'Massachusetts': 'above_avg',
  'Marist': 'above_avg',
  'Jacksonville': 'above_avg',
  'Stony Brook': 'above_avg',
  'Monmouth': 'above_avg',
  'Bucknell': 'above_avg',
  'Loyola Maryland': 'above_avg',
  'Loyola': 'above_avg',
  'Utah': 'above_avg',

  // Average — 40-59% win rate
  'Vermont': 'average',
  'Marquette': 'average',
  'Wagner': 'average',
  'Drexel': 'average',
  'Yale': 'average',
  'Colgate': 'average',
  'Brown': 'average',
  'Lafayette': 'average',
  'Cleveland State': 'average',
  'Cleveland St.': 'average',
  'VMI': 'average',
  'Mercer': 'average',
  'Queens (NC)': 'average',
  'Queens University': 'average',
  'Lehigh': 'average',
  'Holy Cross': 'average',
  'NJIT': 'average',
  'Bryant': 'average',
  'High Point': 'average',
  'Fairfield': 'average',
  'Providence': 'average',
  'Dartmouth': 'average',

  // Weak — sub-40% win rate
  'Hampton': 'weak',
  'Le Moyne': 'weak',
  'Detroit Mercy': 'weak',
  'Detroit': 'weak',
  'Mercyhurst': 'weak',
  'St. John\'s': 'weak',
  'Hofstra': 'weak',
  'Binghamton': 'weak',
  'UMass Lowell': 'weak',
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

export function predictMatchup(teamA: TeamStats, teamB: TeamStats, weights: ModelWeights, useSOS: boolean = false): Prediction {
  const sosA = useSOS ? getSOSTier(teamA.name).multiplier : 1.0;
  const sosB = useSOS ? getSOSTier(teamB.name).multiplier : 1.0;

  const ratingA = computePowerRating(teamA, weights, sosA);
  const ratingB = computePowerRating(teamB, weights, sosB);
  const diff = ratingA - ratingB;

  const rawSpread = diff * 0.25;
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
