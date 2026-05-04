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
// v1: 0.25 | v2: 0.30 | v3: 0.38 (backtest May 2026, n=10, avg actual 6.3 vs model 5.0)
const SPREAD_SCALAR = 0.38;

// ─── SOS TIER SYSTEM ───

export type SOSTier = 'elite' | 'strong' | 'ranked' | 'above_avg' | 'average' | 'weak';

export interface SOSTierInfo {
  tier: SOSTier;
  label: string;
  multiplier: number;
  color: string;
}

// v3 SOS multipliers — wider gap after May 2026 backtest.
// Virginia/Penn State (Big Ten) were being underrated vs A10/CAA opponents
// with inflated stats. Tighter elite threshold + bigger weak penalty fixes this.
export const SOS_TIERS: Record<SOSTier, SOSTierInfo> = {
  elite:     { tier: 'elite',     label: 'Elite',     multiplier: 1.400, color: '#22c55e' },
  strong:    { tier: 'strong',    label: 'Strong',    multiplier: 1.180, color: '#3b82f6' },
  ranked:    { tier: 'ranked',    label: 'Ranked',    multiplier: 1.055, color: '#8b5cf6' },
  above_avg: { tier: 'above_avg', label: 'Above Avg', multiplier: 0.910, color: '#eab308' },
  average:   { tier: 'average',   label: 'Average',   multiplier: 0.790, color: '#a1a1aa' },
  weak:      { tier: 'weak',      label: 'Weak',      multiplier: 0.600, color: '#ef4444' },
};

// ─── DYNAMIC SOS TIER COMPUTATION ───
// Automatically computed from team stats — updates every Wednesday
// when the stats cron refreshes. No manual tier assignments needed.
//
// Uses winPct + scoringMargin to classify teams:
//   Elite:     dominant record AND blowing teams out
//   Strong:    winning consistently with positive margin
//   Ranked:    above .500 with non-negative margin
//   Above Avg: around .500 but competitive
//   Average:   below .500 but still winning some
//   Weak:      bad record, getting outscored

export function getSOSTier(team: TeamStats): SOSTierInfo {
  const wp = team.winPct ?? 0;
  const sm = team.scoringMargin ?? 0;

  if (wp >= 0.78 && sm >= 4.5) return SOS_TIERS.elite;
  if (wp >= 0.67 && sm >= 2.0) return SOS_TIERS.strong;
  if (wp >= 0.50 && sm >= 0)   return SOS_TIERS.ranked;
  if (wp >= 0.40)              return SOS_TIERS.above_avg;
  if (wp >= 0.25)              return SOS_TIERS.average;
  return SOS_TIERS.weak;
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
