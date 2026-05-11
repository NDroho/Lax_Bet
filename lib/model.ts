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
  groundBallsPerGame?: number;
  scoringMargin?: number;
  winPct?: number;
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

// ─── DEFAULT WEIGHTS (v3 — rebalanced May 11, 2026) ───
// Diagnosis after NCAA tournament first round (3-5 SU, terrible vs spread):
//   - v2 underweighted face-off win % (2/92) — face-off wins drive
//     possession, which compounds in single-elimination games.
//   - v2 overweighted turnover margin (29/92) — TO margin is the most
//     opponent-dependent stat. UAlbany's +3 TO edge over UNC drove
//     a "coin flip" prediction on a game that ended 24-6.
//   - v2 underweighted save % and defensive efficiency.
// v3 redistributes weight toward stats that travel better across
// opponents of different strength.

export const DEFAULT_WEIGHTS: ModelWeights = {
  faceOff: 15,
  clearPct: 10,
  shotPct: 22,
  turnoverMargin: 15,
  savePct: 12,
  defEff: 8,
  emo: 8,
};

// ─── SPREAD SCALAR ───
// Controls how power rating differential converts to point spread.
// Kept at 0.30 pending v3 backtest results.
const SPREAD_SCALAR = 0.30;

// ─── WIN PROBABILITY STEEPNESS ───
// v2 used 0.15, which produced absurd extremes (e.g. Princeton -3233 ML
// on Marist, implying a 97% win prob — way overconfident for any single
// lacrosse game). Softened to 0.08 to keep extreme probabilities in a
// realistic range while preserving directional accuracy.
const WIN_PROB_STEEPNESS = 0.08;

// ─── CONFERENCE MAP ───
// Maps team names (as stored in KV) to their D1 men's lacrosse conference.
// Used by the SOS tier system below.
//
// PHASE 1 (current): hard-coded. Update this map when conferences realign
// or when teams are added/removed from KV.
// PHASE 2 (future): the stats cron should scrape and populate the `conf`
// field on TeamStats, and getSOSTier should prefer team.conf when present.
//
// The 10 D1 conferences for 2026: ACC, America East, ASUN, Atlantic 10,
// Big East, Big South, Big Ten, Ivy League, MAAC, Patriot League.
// Independents (Air Force, etc.) get the 'independent' bucket.

export type Conference =
  | 'acc'
  | 'big_ten'
  | 'ivy'
  | 'big_east'
  | 'patriot'
  | 'caa'
  | 'atlantic_10'
  | 'america_east'
  | 'asun'
  | 'big_south'
  | 'maac'
  | 'nec'
  | 'saac'
  | 'independent'
  | 'unknown';

export const CONFERENCE_MAP: Record<string, Conference> = {
  // ─── ACC ───
  'Duke': 'acc',
  'North Carolina': 'acc',
  'Notre Dame': 'acc',
  'Syracuse': 'acc',
  'Virginia': 'acc',

  // ─── Big Ten ───
  'Johns Hopkins': 'big_ten',
  'Maryland': 'big_ten',
  'Michigan': 'big_ten',
  'Ohio St.': 'big_ten',
  'Penn St.': 'big_ten',
  'Rutgers': 'big_ten',

  // ─── Ivy League ───
  'Brown': 'ivy',
  'Cornell': 'ivy',
  'Dartmouth': 'ivy',
  'Harvard': 'ivy',
  'Penn': 'ivy',
  'Princeton': 'ivy',
  'Yale': 'ivy',

  // ─── Big East ───
  'Denver': 'big_east',
  'Georgetown': 'big_east',
  'Marquette': 'big_east',
  "Saint Joseph's": 'big_east',
  'Providence': 'big_east',
  'Villanova': 'big_east',
  'Xavier': 'big_east',

  // ─── Patriot League ───
  'Army West Point': 'patriot',
  'Boston U.': 'patriot',
  'Bucknell': 'patriot',
  'Colgate': 'patriot',
  'Holy Cross': 'patriot',
  'Lafayette': 'patriot',
  'Lehigh': 'patriot',
  'Loyola Maryland': 'patriot',
  'Navy': 'patriot',

  // ─── Coastal Athletic Association (CAA) ───
  'Delaware': 'caa',
  'Drexel': 'caa',
  'Fairfield': 'caa',
  'Hofstra': 'caa',
  'Massachusetts': 'caa',
  'Monmouth': 'caa',
  'Stony Brook': 'caa',
  'Towson': 'caa',

  // ─── Atlantic 10 ───
  'Bellarmine': 'atlantic_10',
  'High Point': 'atlantic_10',
  'Richmond': 'atlantic_10',
  'St. Bonaventure': 'atlantic_10',
  'UMass Lowell': 'atlantic_10',
  'VMI': 'atlantic_10',

  // ─── America East ───
  'Binghamton': 'america_east',
  'NJIT': 'america_east',
  'UAlbany': 'america_east',
  'UMBC': 'america_east',
  'Vermont': 'america_east',

  // ─── ASUN (Atlantic Sun) ───
  'Detroit Mercy': 'asun',
  'Hampton': 'asun',
  'Jacksonville': 'asun',
  'Mercer': 'asun',
  'Queens (NC)': 'asun',

  // ─── Big South ───
  'Cleveland St.': 'big_south',
  'Robert Morris': 'big_south',

  // ─── MAAC ───
  'Canisius': 'maac',
  'Iona': 'maac',
  'LIU': 'maac',
  'Manhattan': 'maac',
  'Marist': 'maac',
  "Mount St. Mary's": 'maac',
  'Quinnipiac': 'maac',
  'Sacred Heart': 'maac',
  'Siena': 'maac',
  "St. John's (NY)": 'maac',
  'Wagner': 'maac',

  // ─── Northeast Conference (NEC) — historical NEC teams that moved ───
  'Bryant': 'nec',
  'Hobart': 'nec',
  'Merrimack': 'nec',
  'St. Bonaventure-NEC': 'nec', // placeholder if needed

  // ─── Southern (SoCon-style) / SAAC ───
  // (none currently)

  // ─── Independents ───
  'Air Force': 'independent',
  'Utah': 'independent',
};

// ─── CONFERENCE STRENGTH MULTIPLIERS ───
// Reflects the realistic tier of each D1 men's lacrosse conference based on
// year-over-year tournament performance and competitive depth. These boost
// stats earned in tough conferences and discount stats earned in weak ones.
//
// Range is intentionally narrower than v2 (1.15x to 0.85x rather than 1.30x
// to 0.65x) to avoid overcorrection. v2's 2x swing was too aggressive.

const CONFERENCE_MULTIPLIER: Record<Conference, number> = {
  acc: 1.15,           // Strongest conference top-to-bottom
  big_ten: 1.12,       // Maryland, JHU, Penn St., Ohio St.
  ivy: 1.10,           // Princeton, Cornell, Yale, Harvard all serious
  big_east: 1.02,      // Top-heavy: Georgetown + Denver above mid-tier
  patriot: 1.00,       // Army elite, rest mid-tier — neutral baseline
  caa: 0.98,           // Towson strong, depth mixed
  atlantic_10: 0.94,   // Richmond is an outlier; rest is weaker
  america_east: 0.88,  // UAlbany inflated by easy conf schedule
  asun: 0.86,          // Jacksonville inflated similarly
  big_south: 0.92,     // Small sample; Robert Morris credible
  maac: 0.85,          // Weakest of the AQ-eligible conferences
  nec: 0.90,           // Hobart and Bryant are decent
  saac: 0.85,          // placeholder
  independent: 0.95,   // No reliable basis — give neutral-ish
  unknown: 1.00,       // Failsafe — never penalize unmapped teams
};

// ─── SOS TIER SYSTEM (UI compatibility) ───
// The Predictor UI in page.tsx imports SOS_TIERS and getSOSTier. We keep the
// same shape so no UI changes are required.
//
// IMPORTANT CHANGE FROM v2: tiers are now derived from conference membership,
// NOT from a team's own winPct/scoringMargin. The old system was circular:
// teams in weak conferences ran up wins, got tagged "Elite," and had their
// stats multiplied by 1.30 — exactly the wrong direction.

export type SOSTier = 'elite' | 'strong' | 'ranked' | 'above_avg' | 'average' | 'weak';

export interface SOSTierInfo {
  tier: SOSTier;
  label: string;
  multiplier: number;
  color: string;
}

export const SOS_TIERS: Record<SOSTier, SOSTierInfo> = {
  elite:     { tier: 'elite',     label: 'Elite',     multiplier: 1.150, color: '#22c55e' },
  strong:    { tier: 'strong',    label: 'Strong',    multiplier: 1.100, color: '#3b82f6' },
  ranked:    { tier: 'ranked',    label: 'Ranked',    multiplier: 1.020, color: '#8b5cf6' },
  above_avg: { tier: 'above_avg', label: 'Above Avg', multiplier: 0.980, color: '#eab308' },
  average:   { tier: 'average',   label: 'Average',   multiplier: 0.920, color: '#a1a1aa' },
  weak:      { tier: 'weak',      label: 'Weak',      multiplier: 0.850, color: '#ef4444' },
};

// Maps a conference multiplier to its displayed tier (for the UI badge).
// The numeric multiplier on the matchup is taken from CONFERENCE_MULTIPLIER
// directly — this function only chooses which colored badge to show.

function multiplierToTier(mult: number): SOSTier {
  if (mult >= 1.13) return 'elite';
  if (mult >= 1.08) return 'strong';
  if (mult >= 1.00) return 'ranked';
  if (mult >= 0.93) return 'above_avg';
  if (mult >= 0.88) return 'average';
  return 'weak';
}

export function getSOSTier(team: TeamStats): SOSTierInfo {
  const conf = CONFERENCE_MAP[team.name] ?? 'unknown';
  const mult = CONFERENCE_MULTIPLIER[conf];
  const tier = multiplierToTier(mult);
  // Return the tier definition but override its multiplier with the precise
  // conference multiplier so getSOSTier(team).multiplier is exact, not bucketed.
  return { ...SOS_TIERS[tier], multiplier: mult };
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
  const sosA = useSOS ? getSOSTier(teamA).multiplier : 1.0;
  const sosB = useSOS ? getSOSTier(teamB).multiplier : 1.0;

  const ratingA = computePowerRating(teamA, weights, sosA);
  const ratingB = computePowerRating(teamB, weights, sosB);
  const diff = ratingA - ratingB;

  const rawSpread = diff * SPREAD_SCALAR;
  const spread = Math.round(rawSpread * 2) / 2;
  // Softened logistic — see WIN_PROB_STEEPNESS comment above.
  const winProbA = 1 / (1 + Math.exp(-diff * WIN_PROB_STEEPNESS));

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
