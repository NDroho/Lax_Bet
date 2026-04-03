'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TeamStats, ModelWeights, DEFAULT_WEIGHTS, computePowerRating, predictMatchup, probToAmericanOdds, getConfidenceTier, SlateGame } from '@/lib/model';

interface RankingEntry { rank: number; team: string; record: string; prev: string; }

function StatBar({ value, max = 100, color = 'var(--accent)' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ width: '100%', height: 6, background: 'var(--bar-bg)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
    </div>
  );
}

function WeightSlider({ label, value, onChange, accent }: { label: string; value: number; onChange: (v: number) => void; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ width: 130, fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{label}</span>
      <input type="range" min={0} max={40} value={value} onChange={e => onChange(parseInt(e.target.value))} style={{ flex: 1, accentColor: accent }} />
      <span style={{ width: 30, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );
}

// ─── DATE HELPERS ───

function getTodayET(): string {
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = eastern.getFullYear();
  const m = String(eastern.getMonth() + 1).padStart(2, '0');
  const d = String(eastern.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function shiftDate(yyyymmdd: string, days: number): string {
  const y = parseInt(yyyymmdd.slice(0, 4));
  const m = parseInt(yyyymmdd.slice(4, 6)) - 1;
  const d = parseInt(yyyymmdd.slice(6, 8));
  const dt = new Date(y, m, d);
  dt.setDate(dt.getDate() + days);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}${nm}${nd}`;
}

function formatDateDisplay(yyyymmdd: string): string {
  const y = parseInt(yyyymmdd.slice(0, 4));
  const m = parseInt(yyyymmdd.slice(4, 6)) - 1;
  const d = parseInt(yyyymmdd.slice(6, 8));
  const dt = new Date(y, m, d);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function isToday(yyyymmdd: string): boolean {
  return yyyymmdd === getTodayET();
}

// ─── DISCLAIMER POPUP ───

function DisclaimerPopup({ onAccept }: { onAccept: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: '#131820', border: '1px solid #2a3344', borderRadius: 12,
        padding: '32px 28px', maxWidth: 520, width: '100%',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--accent)',
          letterSpacing: 2, margin: '0 0 6px', lineHeight: 1,
        }}>LAX EDGE</h2>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, marginBottom: 20 }}>
          DISCLAIMER
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 24 }}>
          <p style={{ margin: '0 0 12px' }}>
            All content on this site is provided <strong style={{ color: 'var(--text-primary)' }}>strictly for informational and entertainment purposes only</strong>.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            LAX EDGE is a <strong style={{ color: 'var(--text-primary)' }}>statistical analysis tool</strong>. All projections and ratings are generated from publicly available NCAA data and are intended solely for informational use.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            Predictions are <strong style={{ color: 'var(--text-primary)' }}>probabilistic estimates</strong> based on historical team performance metrics. They are not guarantees of any outcome and should not be relied upon for any purpose beyond personal informational use.
          </p>
          <p style={{ margin: 0 }}>
            By accessing this site, you acknowledge that all content is provided as-is with no warranty of accuracy, and that you assume all responsibility for how you use this information.
          </p>
        </div>

        <button onClick={onAccept} style={{
          width: '100%', padding: '14px', background: 'var(--accent)', color: '#0a0e14',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
          fontFamily: 'var(--font-mono)', cursor: 'pointer', letterSpacing: 1.5,
        }}>
          I UNDERSTAND — ENTER SITE
        </button>
      </div>
    </div>
  );
}

// ─── INLINE GAME PREDICTION CARD ───

function GameCard({
  game, prediction, favName, underdogName, onClickAnalyze, index, total,
}: {
  game: SlateGame;
  prediction: { spread: number; projTotal: number; winProbA: number; confidence: number; mlValue: boolean } | null;
  favName: string;
  underdogName: string;
  onClickAnalyze: () => void;
  index: number;
  total: number;
}) {
  const tier = prediction ? getConfidenceTier(prediction.confidence) : null;
  const tierColor = tier === 'STRONG' ? 'var(--green)' : tier === 'LEAN' ? 'var(--amber)' : 'var(--text-muted)';

  return (
    <div
      onClick={onClickAnalyze}
      style={{
        padding: '14px 20px',
        borderBottom: index < total - 1 ? '1px solid var(--border)' : 'none',
        background: index % 2 === 0 ? 'transparent' : 'var(--surface-2)',
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
      onMouseLeave={e => (e.currentTarget.style.background = index % 2 === 0 ? 'transparent' : 'var(--surface-2)')}
    >
      {/* Row 1: Matchup + Time */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: prediction ? 10 : 0 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{game.away}</span>
          <span style={{ color: 'var(--text-muted)', margin: '0 8px', fontSize: 12 }}>at</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{game.home}</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {game.time && game.time !== 'TBD' ? game.time : ''}
        </span>
      </div>

      {/* Row 2: Prediction line — spread, total, ML */}
      {prediction && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Spread */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>SPREAD</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
              {prediction.spread === 0 ? 'PK' : `${favName} ${prediction.spread > 0 ? -Math.abs(prediction.spread) : -Math.abs(prediction.spread)}`}
            </span>
          </div>

          {/* Divider */}
          <span style={{ color: 'var(--border)', fontSize: 14 }}>|</span>

          {/* Total */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>TOTAL</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
              {prediction.projTotal}
            </span>
          </div>

          {/* Divider */}
          <span style={{ color: 'var(--border)', fontSize: 14 }}>|</span>

          {/* ML */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>ML</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
              {favName} {probToAmericanOdds(Math.max(prediction.winProbA, 1 - prediction.winProbA))}
            </span>
          </div>

          {/* Divider */}
          <span style={{ color: 'var(--border)', fontSize: 14 }}>|</span>

          {/* Confidence tier */}
          <span style={{
            fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: 1.2,
            color: tierColor,
            background: tier === 'STRONG' ? 'rgba(102,187,106,0.12)' : tier === 'LEAN' ? 'rgba(255,202,40,0.12)' : 'rgba(74,85,104,0.12)',
            padding: '2px 7px', borderRadius: 3,
          }}>
            {tier}
          </span>

          {prediction.mlValue && (
            <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--green)', letterSpacing: 1 }}>★ VALUE</span>
          )}
        </div>
      )}

      {/* No prediction available */}
      {!prediction && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
          No model data available
        </div>
      )}
    </div>
  );
}

// ─── MAIN DASHBOARD ───

export default function Dashboard() {
  const [teams, setTeams] = useState<TeamStats[]>([]);
  const [schedule, setSchedule] = useState<SlateGame[]>([]);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [alsoConsidered, setAlsoConsidered] = useState<string[]>([]);
  const [rankingsWeek, setRankingsWeek] = useState('');
  const [weights, setWeights] = useState<ModelWeights>(DEFAULT_WEIGHTS);
  const [activeTab, setActiveTab] = useState('slate');
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [showWeights, setShowWeights] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayET());

  // Check if disclaimer was already accepted this session
  useEffect(() => {
    try {
      if (sessionStorage.getItem('lax-edge-disclaimer') === 'accepted') {
        setDisclaimerAccepted(true);
      }
    } catch {}
  }, []);

  function handleAcceptDisclaimer() {
    setDisclaimerAccepted(true);
    try { sessionStorage.setItem('lax-edge-disclaimer', 'accepted'); } catch {}
  }

  // Fetch schedule for a specific date
  const fetchSchedule = useCallback(async (date: string) => {
    setScheduleLoading(true);
    try {
      const res = await fetch(`/api/schedule?date=${date}`);
      const data = await res.json();
      setSchedule(data.games || []);
    } catch (err) {
      console.error('Failed to load schedule:', err);
      setSchedule([]);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    async function loadData() {
      try {
        const [teamsRes, schedRes, rankRes] = await Promise.all([
          fetch('/api/teams'), fetch(`/api/schedule?date=${selectedDate}`), fetch('/api/rankings'),
        ]);
        const teamsData = await teamsRes.json();
        const schedData = await schedRes.json();
        const rankData = await rankRes.json();
        if (teamsData.teams?.length > 0) {
          setTeams(teamsData.teams);
          setTeamAName(teamsData.teams[0]?.name || '');
          if (teamsData.teams.length > 1) setTeamBName(teamsData.teams[1]?.name || '');
        }
        if (schedData.games?.length > 0) setSchedule(schedData.games);
        if (rankData.rankings?.length > 0) { setRankings(rankData.rankings); setAlsoConsidered(rankData.alsoConsidered || []); setRankingsWeek(rankData.weekLabel || ''); }
      } catch (err) { console.error('Failed to load:', err); }
      finally { setLoading(false); }
    }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Date navigation
  function goToDate(date: string) {
    setSelectedDate(date);
    fetchSchedule(date);
  }

  function goPrev() { goToDate(shiftDate(selectedDate, -1)); }
  function goNext() { goToDate(shiftDate(selectedDate, 1)); }
  function goToday() { goToDate(getTodayET()); }

  const sortedTeams = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);
  const teamA = teams.find(t => t.name === teamAName);
  const teamB = teams.find(t => t.name === teamBName);
  const prediction = useMemo(() => teamA && teamB ? predictMatchup(teamA, teamB, weights) : null, [teamA, teamB, weights]);
  const updateWeight = useCallback((key: string, val: number) => setWeights(prev => ({ ...prev, [key]: val })), []);

  // Match ESPN team names to stats team names (fuzzy match)
  const findTeamName = useCallback((espnName: string): string | null => {
    if (!espnName) return null;
    const lower = espnName.toLowerCase();
    const exact = teams.find(t => t.name.toLowerCase() === lower);
    if (exact) return exact.name;
    const partial = teams.find(t =>
      lower.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(lower)
    );
    if (partial) return partial.name;
    const cleaned = lower.replace(/(university|college|institute|state|st\.)?\s*(blue jays|scarlet knights|tar heels|orange|cavaliers|fighting irish|big green|terriers|crimson|hoyas|pioneers|retrievers|bulldogs|bears|tigers|lions|eagles|hawks|cardinals|wildcats|wolverines|aggies|huskies|panthers|rams|red storm|wolfpack|demon deacons|yellow jackets)?\s*$/i, '').trim();
    if (cleaned) {
      const cleanMatch = teams.find(t => t.name.toLowerCase().includes(cleaned) || cleaned.includes(t.name.toLowerCase()));
      if (cleanMatch) return cleanMatch.name;
    }
    return null;
  }, [teams]);

  // Compute predictions for all schedule games
  const schedulePredictions = useMemo(() => {
    return schedule.map(game => {
      const awayTeam = teams.find(t => {
        const n = t.name.toLowerCase();
        const g = game.away.toLowerCase();
        return n === g || g.includes(n) || n.includes(g);
      });
      const homeTeam = teams.find(t => {
        const n = t.name.toLowerCase();
        const g = game.home.toLowerCase();
        return n === g || g.includes(n) || n.includes(g);
      });
      if (awayTeam && homeTeam) {
        const pred = predictMatchup(awayTeam, homeTeam, weights);
        // Determine favorite
        const favIsAway = pred.winProbA >= 0.5;
        const favName = favIsAway ? game.away : game.home;
        const underdogName = favIsAway ? game.home : game.away;
        return { prediction: pred, favName, underdogName, awayTeam, homeTeam };
      }
      return { prediction: null, favName: '', underdogName: '', awayTeam: null, homeTeam: null };
    });
  }, [schedule, teams, weights]);

  function handleSlateClick(awayEspn: string, homeEspn: string) {
    const matchA = findTeamName(awayEspn);
    const matchB = findTeamName(homeEspn);
    if (matchA) setTeamAName(matchA);
    if (matchB) setTeamBName(matchB);
    setActiveTab('predict');
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>Loading LAX EDGE...</div>;

  const tabs = [{ key: 'slate', label: 'SCHEDULE' }, { key: 'predict', label: 'PREDICTOR' }, { key: 'rankings', label: 'RANKINGS' }];

  const FOOTER_DISCLAIMER = 'For informational and entertainment purposes only. All predictions are probabilistic estimates based on publicly available NCAA data and are not guarantees of any outcome. Content is provided as-is with no warranty of accuracy.';

  return (
    <div>
      {/* Disclaimer popup */}
      {!disclaimerAccepted && <DisclaimerPopup onAccept={handleAcceptDisclaimer} />}

      {/* HEADER */}
      <div style={{ background: 'linear-gradient(135deg, #0d1420 0%, #162030 50%, #0d1825 100%)', borderBottom: '1px solid var(--border)', padding: '20px 24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, letterSpacing: 2, color: 'var(--accent)', margin: 0, lineHeight: 1 }}>LAX EDGE</h1>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>NCAA D1 MEN'S LACROSSE</span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-dim)' }}>Matchup predictor & schedule</p>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            flex: 1, padding: '12px', background: activeTab === tab.key ? 'var(--surface)' : 'transparent',
            color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-dim)', border: 'none',
            borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5, cursor: 'pointer',
          }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>

        {/* ═══ SCHEDULE ═══ */}
        {activeTab === 'slate' && (
          <div>
            {/* Date navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
              <button onClick={goPrev} style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 18, padding: '6px 14px', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', lineHeight: 1,
              }}>◀</button>

              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5 }}>
                  {formatDateDisplay(selectedDate)} — {scheduleLoading ? '...' : `${schedule.length} GAME${schedule.length !== 1 ? 'S' : ''}`}
                </div>
                {!isToday(selectedDate) && (
                  <button onClick={goToday} style={{
                    background: 'none', border: 'none', color: 'var(--accent)', fontSize: 10,
                    fontFamily: 'var(--font-mono)', cursor: 'pointer', marginTop: 4, letterSpacing: 1,
                    textDecoration: 'underline', padding: 0,
                  }}>
                    BACK TO TODAY
                  </button>
                )}
              </div>

              <button onClick={goNext} style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-primary)', fontSize: 18, padding: '6px 14px', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', lineHeight: 1,
              }}>▶</button>
            </div>

            {/* Loading state */}
            {scheduleLoading && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>Loading schedule...</div>
              </div>
            )}

            {/* No games */}
            {!scheduleLoading && schedule.length === 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 8 }}>No games scheduled</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Try navigating to a different date or use the Predictor tab</div>
              </div>
            )}

            {/* Games list */}
            {!scheduleLoading && schedule.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid var(--border)', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: 1.2 }}>
                  <span>MATCHUP & LAX EDGE LINE <span style={{ color: 'var(--accent)', marginLeft: 8, letterSpacing: 0.5 }}>click to analyze</span></span>
                </div>
                {schedule.map((g, i) => {
                  const sp = schedulePredictions[i];
                  return (
                    <GameCard
                      key={i}
                      game={g}
                      prediction={sp?.prediction || null}
                      favName={sp?.favName || ''}
                      underdogName={sp?.underdogName || ''}
                      onClickAnalyze={() => handleSlateClick(g.away, g.home)}
                      index={i}
                      total={schedule.length}
                    />
                  );
                })}
              </div>
            )}

            {/* Legend */}
            {!scheduleLoading && schedule.length > 0 && (
              <div style={{ marginTop: 12, padding: '10px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.2 }}>CONFIDENCE:</span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--green)', fontWeight: 700 }}>STRONG</span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--amber)', fontWeight: 700 }}>LEAN</span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 700 }}>TOSS-UP</span>
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>★ VALUE = strong ML edge</span>
              </div>
            )}
          </div>
        )}

        {/* ═══ PREDICTOR ═══ */}
        {activeTab === 'predict' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', marginBottom: 24 }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>TEAM A</label>
                <select value={teamAName} onChange={e => setTeamAName(e.target.value)} style={{
                  width: '100%', marginTop: 4, padding: '10px 12px', background: 'var(--surface-2)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 6, fontSize: 15, fontWeight: 700,
                }}>
                  {sortedTeams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-muted)', marginTop: 16 }}>VS</div>
              <div>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>TEAM B</label>
                <select value={teamBName} onChange={e => setTeamBName(e.target.value)} style={{
                  width: '100%', marginTop: 4, padding: '10px 12px', background: 'var(--surface-2)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 6, fontSize: 15, fontWeight: 700,
                }}>
                  {sortedTeams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            </div>

            {prediction && teamA && teamB && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, marginBottom: 8 }}>SPREAD</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1, color: prediction.spread !== 0 ? 'var(--green)' : 'var(--text-primary)' }}>
                      {prediction.spread > 0 ? `${teamAName} -${Math.abs(prediction.spread)}` : prediction.spread < 0 ? `${teamBName} -${Math.abs(prediction.spread)}` : 'PICK'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                      {prediction.spread !== 0 ? `${prediction.spread > 0 ? teamAName : teamBName} favored` : 'Even matchup'}
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, marginBottom: 8 }}>PROJECTED TOTAL</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, lineHeight: 1, color: 'var(--amber)' }}>{prediction.projTotal}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                      {Math.round(prediction.projTotal / 2 + Math.abs(prediction.spread) / 2)}-{Math.round(prediction.projTotal / 2 - Math.abs(prediction.spread) / 2)} proj score
                    </div>
                  </div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, marginBottom: 8 }}>WIN PROB</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, lineHeight: 1, color: 'var(--accent)' }}>
                      {Math.round(Math.max(prediction.winProbA, 1 - prediction.winProbA) * 100)}%
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                      {prediction.winProbA >= 0.5 ? teamAName : teamBName}
                      <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent)' }}>
                        {probToAmericanOdds(Math.max(prediction.winProbA, 1 - prediction.winProbA))}
                      </span>
                      {prediction.mlValue && <span style={{ color: 'var(--green)', marginLeft: 6, fontWeight: 700 }}>★ ML VALUE</span>}
                    </div>
                  </div>
                </div>

                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, whiteSpace: 'nowrap' }}>CONFIDENCE</span>
                  <div style={{ flex: 1 }}><StatBar value={prediction.confidence} max={100} color={prediction.confidence > 70 ? 'var(--green)' : prediction.confidence > 50 ? 'var(--amber)' : 'var(--red)'} /></div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700 }}>{prediction.confidence}%</span>
                </div>

                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, marginBottom: 14 }}>HEAD-TO-HEAD STAT COMPARISON</div>
                  {[
                    { label: 'Face-Off Win %', a: teamA.foWin, b: teamB.foWin, fmt: (v: number) => (v * 100).toFixed(1) + '%' },
                    { label: 'Shot %', a: teamA.shotPct, b: teamB.shotPct, fmt: (v: number) => (v * 100).toFixed(1) + '%' },
                    { label: 'Save %', a: teamA.savePct, b: teamB.savePct, fmt: (v: number) => (v * 100).toFixed(1) + '%' },
                    { label: 'TO Margin', a: teamA.causedTurnoversPerGame - teamA.turnoversPerGame, b: teamB.causedTurnoversPerGame - teamB.turnoversPerGame, fmt: (v: number) => (v > 0 ? '+' : '') + v.toFixed(1) },
                    { label: 'Scoring Off', a: teamA.scoringOff, b: teamB.scoringOff, fmt: (v: number) => v.toFixed(1) },
                    { label: 'Scoring Def', a: teamA.scoringDef, b: teamB.scoringDef, fmt: (v: number) => v.toFixed(1), invert: true },
                    { label: 'Clear %', a: teamA.clearPct, b: teamB.clearPct, fmt: (v: number) => (v * 100).toFixed(1) + '%' },
                    { label: 'Power Rating', a: prediction.ratingA, b: prediction.ratingB, fmt: (v: number) => v.toFixed(1) },
                  ].map((row, i) => {
                    const aWins = row.invert ? row.a < row.b : row.a > row.b;
                    const bWins = row.invert ? row.b < row.a : row.b > row.a;
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 1fr 80px', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ textAlign: 'right', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: aWins ? 'var(--green)' : 'var(--text-dim)' }}>{row.fmt(row.a)}</span>
                        <div style={{ height: 4, borderRadius: 2, background: aWins ? 'var(--green)' : 'var(--bar-bg)', opacity: aWins ? 0.6 : 0.3 }} />
                        <span style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{row.label}</span>
                        <div style={{ height: 4, borderRadius: 2, background: bWins ? 'var(--green)' : 'var(--bar-bg)', opacity: bWins ? 0.6 : 0.3 }} />
                        <span style={{ textAlign: 'left', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: bWins ? 'var(--green)' : 'var(--text-dim)' }}>{row.fmt(row.b)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <button onClick={() => setShowWeights(!showWeights)} style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', width: '100%',
              color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer', letterSpacing: 1,
            }}>
              {showWeights ? '▾ HIDE' : '▸ SHOW'} MODEL WEIGHTS
            </button>
            {showWeights && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginTop: 12 }}>
                <WeightSlider label="Face-Off %" value={weights.faceOff} onChange={v => updateWeight('faceOff', v)} accent="var(--accent)" />
                <WeightSlider label="Clear %" value={weights.clearPct} onChange={v => updateWeight('clearPct', v)} accent="#81d4fa" />
                <WeightSlider label="Shot %" value={weights.shotPct} onChange={v => updateWeight('shotPct', v)} accent="var(--green)" />
                <WeightSlider label="TO Margin" value={weights.turnoverMargin} onChange={v => updateWeight('turnoverMargin', v)} accent="var(--amber)" />
                <WeightSlider label="Save %" value={weights.savePct} onChange={v => updateWeight('savePct', v)} accent="var(--red)" />
                <WeightSlider label="Def Eff" value={weights.defEff} onChange={v => updateWeight('defEff', v)} accent="#80cbc4" />
                <WeightSlider label="EMO" value={weights.emo} onChange={v => updateWeight('emo', v)} accent="#ce93d8" />
                <button onClick={() => setWeights(DEFAULT_WEIGHTS)} style={{
                  marginTop: 8, padding: '6px 14px', background: 'var(--surface-3)', border: '1px solid var(--border)',
                  borderRadius: 5, color: 'var(--text-dim)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                }}>RESET DEFAULTS</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ RANKINGS ═══ */}
        {activeTab === 'rankings' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5 }}>USA LACROSSE DI MEN'S TOP 20</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{rankingsWeek || 'Loading...'}</div>
            </div>
            {rankings.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>Rankings not yet loaded</div>
              </div>
            ) : (
              <>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '45px 1fr 70px 50px', padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: 1.2 }}>
                    <span>RANK</span><span>TEAM</span><span style={{ textAlign: 'center' }}>RECORD</span><span style={{ textAlign: 'center' }}>PREV</span>
                  </div>
                  {rankings.map((r, i) => {
                    const prevNum = parseInt(r.prev);
                    const moved = isNaN(prevNum) ? 'new' : prevNum > r.rank ? 'up' : prevNum < r.rank ? 'down' : 'same';
                    return (
                      <div key={r.rank} style={{
                        display: 'grid', gridTemplateColumns: '45px 1fr 70px 50px', padding: '11px 16px',
                        borderBottom: i < rankings.length - 1 ? '1px solid var(--border)' : 'none',
                        background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)', alignItems: 'center',
                      }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: r.rank <= 5 ? 'var(--accent)' : 'var(--text-dim)' }}>{r.rank}</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{r.team}</span>
                        <span style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{r.record}</span>
                        <span style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: moved === 'up' ? 'var(--green)' : moved === 'down' ? 'var(--red)' : moved === 'new' ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {moved === 'up' ? `▲${prevNum - r.rank}` : moved === 'down' ? `▼${r.rank - prevNum}` : moved === 'new' ? 'NR' : '–'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {alsoConsidered.length > 0 && (
                  <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.2, marginBottom: 8 }}>ALSO CONSIDERED</div>
                    <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{alsoConsidered.join(' · ')}</div>
                  </div>
                )}
                <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
                  Rankings compiled by USA Lacrosse Magazine staff and contributors with input from coaches.
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── FOOTER DISCLAIMER ─── */}
        <div style={{ marginTop: 32, padding: '16px 0', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.8, maxWidth: 600, margin: '0 auto', letterSpacing: 0.3 }}>
            {FOOTER_DISCLAIMER}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 12, letterSpacing: 0.5 }}>
            LAX EDGE v4.0
          </div>
        </div>
      </div>
    </div>
  );
}
