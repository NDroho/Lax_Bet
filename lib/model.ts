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

// ─── DEFAULT WEIGHTS (v4 — May 8, 2026) ───
// Backtested against 520 games (full 2026 season to date).
// Direction accuracy: 75.4% | Spread MAE: ±4.6 | Total MAE: ±3.6
//
// Changes from v3:
// - Removed defEff entirely: it was 1-oppShotPct, which is derived from savePct
//   in the stats scraper. The two inputs were collinear — encoding the same
//   defensive signal twice. savePct now carries the full defensive load.
// - faceOff: 2 → 1. Near-zero win-prediction signal per D1 research; possession
//   margin from ground balls and turnovers is more predictive than faceoff win %.
// - turnoverMargin: 29 → 32. Strongest single predictor per analytics research
//   (teams winning ground ball battle by 4+ win 70% of the time).
// - savePct: 7 → 10. Now the sole defensive efficiency input; weighted up
//   to compensate for defEff removal.
// Total weight: 91 (vs 92 previously — faceOff -1, defEff -3, savePct +3, turnoverMargin +3)

export const DEFAULT_WEIGHTS: ModelWeights = {
  faceOff: 1,
  clearPct: 15,
  shotPct: 23,
  turnoverMargin: 32,
  savePct: 10,
  emo: 10,
};

// ─── SPREAD SCALAR ───
// v1: 0.25 | v2: 0.30 | v3: 0.38 (n=10) | v4: 0.38 (confirmed n=520, spread bias +0.8)
// Bias of +0.8 is well within tolerance — scalar holds.
const SPREAD_SCALAR = 0.38;

// ─── D1 AVERAGE SCORING (used for total projection) ───
// Based on 2026 season averages. Updated when season data warrants.
const D1_AVG_GOALS_PER_GAME = 12.0;

// ─── SOS TIER SYSTEM ───

export type SOSTier = 'elite' | 'strong' | 'ranked' | 'above_avg' | 'average' | 'weak';

export interface SOSTierInfo {
  tier: SOSTier;
  label: string;
  multiplier: number;
  color: string;
}

export const SOS_TIERS: Record<SOSTier, SOSTierInfo> = {
  elite:     { tier: 'elite',     label: 'Elite',     multiplier: 1.400, color: '#22c55e' },
  strong:    { tier: 'strong',    label: 'Strong',    multiplier: 1.180, color: '#3b82f6' },
  ranked:    { tier: 'ranked',    label: 'Ranked',    multiplier: 1.055, color: '#8b5cf6' },
  above_avg: { tier: 'above_avg', label: 'Above Avg', multiplier: 0.910, color: '#eab308' },
  average:   { tier: 'average',   label: 'Average',   multiplier: 0.790, color: '#a1a1aa' },
  weak:      { tier: 'weak',      label: 'Weak',      multiplier: 0.600, color: '#ef4444' },
};

// ─── CONFERENCE TIERS ───
// Power conf: floored at "ranked" — tough-schedule stats aren't punished.
// Weak conf: capped at "above_avg" — inflated stats against weak opponents
//   can't reach elite/strong.
//
// v4 fixes: removed Denver and Air Force from WEAK_CONF — both are legitimate
// mid-major programs with consistent top-30 performance. Moved to mid-major
// tier handled by pure stats logic.

const POWER_CONF = new Set([
  // ACC
  'Duke', 'North Carolina', 'Virginia', 'Syracuse', 'Notre Dame', 'Boston College',
  // Big Ten
  'Penn State', 'Maryland', 'Johns Hopkins', 'Ohio State', 'Michigan', 'Rutgers',
  // Ivy League
  'Princeton', 'Cornell', 'Yale', 'Brown', 'Harvard', 'Dartmouth', 'Columbia', 'Pennsylvania',
]);

const WEAK_CONF = new Set([
  // Atlantic 10
  'Richmond', "Saint Joseph's", 'Massachusetts', 'UMass Lowell', 'La Salle', 'Davidson', 'George Mason',
  // America East
  'Vermont', 'Albany', 'UMBC', 'New Hampshire', 'Hartford', 'Binghamton',
  // MAAC
  'Marist', 'Siena', 'Fairfield', 'Manhattan', 'Quinnipiac', 'Canisius',
  // NEC
  'Bryant', "Mount St. Mary's", 'LIU', 'St. Francis',
  // ASUN / SoCon
  'Jacksonville', 'Bellarmine', 'High Point',
]);

// ─── DYNAMIC SOS TIER COMPUTATION ───

export function getSOSTier(team: TeamStats): SOSTierInfo {
  const wp = team.winPct ?? 0;
  const sm = team.scoringMargin ?? 0;

  if (POWER_CONF.has(team.name)) {
    if (wp >= 0.78 && sm >= 4.5) return SOS_TIERS.elite;
    if (wp >= 0.55)              return SOS_TIERS.strong;
    return SOS_TIERS.ranked;
  }

  if (WEAK_CONF.has(team.name)) {
    if (wp >= 0.78 && sm >= 4.5) return SOS_TIERS.above_avg;
    if (wp >= 0.67 && sm >= 2.0) return SOS_TIERS.average;
    return SOS_TIERS.average;
  }

  // Mid-major / everyone else: purely stats-based
  if (wp >= 0.78 && sm >= 4.5) return SOS_TIERS.elite;
  if (wp >= 0.67 && sm >= 2.0) return SOS_TIERS.strong;
  if (wp >= 0.50 && sm >= 0)   return SOS_TIERS.ranked;
  if (wp >= 0.40)              return SOS_TIERS.above_avg;
  if (wp >= 0.25)              return SOS_TIERS.average;
  return SOS_TIERS.weak;
}

// ─── NORMALIZATION ───

const STAT_RANGES = {
  faceOff:       { min: 0.35, max: 0.70 },
  clearPct:      { min: 0.80, max: 0.96 },
  shotPct:       { min: 0.20, max: 0.38 },
  turnoverMargin:{ min: -6,   max: 6    },
  savePct:       { min: 0.45, max: 0.65 },
  emo:           { min: 0.15, max: 0.60 },
};

function normalize(val: number, min: number, max: number): number {
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

// ─── POWER RATING ───

export function computePowerRating(
  team: TeamStats,
  weights: ModelWeights,
  sosMultiplier: number = 1.0,
): number {
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const turnoverMargin = team.causedTurnoversPerGame - team.turnoversPerGame;
  const emoComposite = (team.manUpPct + team.manDownPct) / 2;

  const scores: Record<string, number> = {
    faceOff:       normalize(team.foWin, STAT_RANGES.faceOff.min, STAT_RANGES.faceOff.max),
    clearPct:      normalize(team.clearPct, STAT_RANGES.clearPct.min, STAT_RANGES.clearPct.max),
    shotPct:       normalize(team.shotPct, STAT_RANGES.shotPct.min, STAT_RANGES.shotPct.max),
    turnoverMargin:normalize(turnoverMargin, STAT_RANGES.turnoverMargin.min, STAT_RANGES.turnoverMargin.max),
    // savePct is the sole defensive efficiency input (replaces defEff + savePct combo).
    // Higher save % = better goalie/defense = higher rating. Range updated to 0.45-0.65
    // to better reflect actual 2026 D1 distribution.
    savePct:       normalize(team.savePct, STAT_RANGES.savePct.min, STAT_RANGES.savePct.max),
    emo:           normalize(emoComposite, STAT_RANGES.emo.min, STAT_RANGES.emo.max),
  };

  let rating = 0;
  for (const key of Object.keys(weights)) {
    rating += (scores[key] || 0) * (weights[key] / totalWeight);
  }

  rating *= sosMultiplier;

  return Math.round(rating * 1000) / 10;
}

// ─── PROJECTED TOTAL ───
// v3 formula averaged raw scoringOff + scoringDef for both teams, which
// double-counted and was insensitive to actual defensive matchup quality.
//
// v4: project each team's goals independently.
//   Each team's expected goals = their scoringOff, adjusted by how much
//   better or worse the opponent's defense is relative to the D1 average.
//   A team facing an elite defense (low scoringDef) will be discounted;
//   facing a weak defense (high scoringDef) they get a bonus.
//
//   defFactor = opponent scoringDef / D1_AVG_GOALS_PER_GAME
//   expectedGoals = teamScoringOff * defFactor
//
// This means totals are properly sensitive to both offensive and defensive
// quality rather than just averaging raw numbers.

function projectGoals(offScoringAvg: number, oppDefScoringAvg: number): number {
  const defFactor = oppDefScoringAvg / D1_AVG_GOALS_PER_GAME;
  return offScoringAvg * defFactor;
}

// ─── MATCHUP PREDICTION ───

export function predictMatchup(
  teamA: TeamStats,
  teamB: TeamStats,
  weights: ModelWeights,
  useSOS: boolean = true,
): Prediction {
  const sosA = useSOS ? getSOSTier(teamA).multiplier : 1.0;
  const sosB = useSOS ? getSOSTier(teamB).multiplier : 1.0;

  const ratingA = computePowerRating(teamA, weights, sosA);
  const ratingB = computePowerRating(teamB, weights, sosB);
  const diff = ratingA - ratingB;

  const rawSpread = diff * SPREAD_SCALAR;
  const spread = Math.round(Math.max(-14, Math.min(14, rawSpread)) * 2) / 2;
  const winProbA = 1 / (1 + Math.exp(-diff * 0.15));

  // Project each team's goals independently based on opponent defensive quality
  const goalsA = projectGoals(teamA.scoringOff, teamB.scoringDef);
  const goalsB = projectGoals(teamB.scoringOff, teamA.scoringDef);
  const projTotal = Math.round((goalsA + goalsB) * 2) / 2;

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
