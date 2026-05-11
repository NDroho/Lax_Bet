'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TeamStats, ModelWeights, DEFAULT_WEIGHTS, predictMatchup, probToAmericanOdds, getConfidenceTier, SlateGame, getSOSTier } from '@/lib/model';

interface RankingEntry { rank: number; team: string; record: string; prev: string; }

interface BacktestResult {
  input: string;
  team1: string; team2: string; score1: number; score2: number;
  matched1: string | null; matched2: string | null;
  predictedSpread: number; actualMargin: number;
  error: number; directionCorrect: boolean; modelHasData: boolean;
}

function StatBar({ value, max = 100, color = 'var(--accent)' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ width: '100%', height: 5, background: 'var(--bar-bg)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
    </div>
  );
}

function WeightSlider({ label, value, onChange, accent }: { label: string; value: number; onChange: (v: number) => void; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <span style={{ width: 130, fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 }}>{label}</span>
      <input type="range" min={0} max={40} value={value} onChange={e => onChange(parseInt(e.target.value))} style={{ flex: 1, accentColor: accent }} />
      <span style={{ width: 28, textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
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
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function isToday(yyyymmdd: string): boolean {
  return yyyymmdd === getTodayET();
}

// ─── DISCLAIMER POPUP ───

function DisclaimerPopup({ onAccept }: { onAccept: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.4)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: '#fff', borderRadius: 18,
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        padding: '36px 32px', maxWidth: 500, width: '100%',
      }}>
        <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: 1, textTransform: 'uppercase' }}>
          Before you continue
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 20px', letterSpacing: -0.5 }}>
          Lax Edge Disclaimer
        </h2>
        <div style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.75, marginBottom: 28 }}>
          <p style={{ margin: '0 0 12px' }}>
            All content is provided <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>for informational and entertainment purposes only</strong>.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            Lax Edge is a <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>statistical analysis tool</strong>. All projections are generated from publicly available NCAA data.
          </p>
          <p style={{ margin: 0 }}>
            Predictions are <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>probabilistic estimates</strong>, not guarantees. By continuing, you accept full responsibility for how you use this information.
          </p>
        </div>
        <button onClick={onAccept} style={{
          width: '100%', padding: '14px', background: 'var(--accent)', color: '#fff',
          border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600,
          cursor: 'pointer', letterSpacing: 0, transition: 'opacity 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          I understand — Enter site
        </button>
      </div>
    </div>
  );
}

// ─── GAME CARD ───

function GameCard({
  game, prediction, favName, onClickAnalyze, index, total,
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
  const tierBg = tier === 'STRONG' ? 'rgba(40,167,69,0.1)' : tier === 'LEAN' ? 'rgba(255,149,0,0.1)' : 'rgba(0,0,0,0.05)';

  return (
    <div
      onClick={onClickAnalyze}
      style={{
        padding: '16px 20px',
        borderBottom: index < total - 1 ? '1px solid var(--border)' : 'none',
        cursor: 'pointer', transition: 'background 0.12s',
        background: 'transparent',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: prediction ? 10 : 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          <span>{game.away}</span>
          <span style={{ color: 'var(--text-muted)', margin: '0 8px', fontWeight: 400, fontSize: 13 }}>at</span>
          <span>{game.home}</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {game.time && game.time !== 'TBD' ? game.time : ''}
        </span>
      </div>
      {prediction && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--surface-2)', borderRadius: 6, padding: '3px 8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {prediction.spread === 0 ? 'PK' : `${favName} ${-Math.abs(prediction.spread)}`}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--surface-2)', borderRadius: 6, padding: '3px 8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            O/U {prediction.projTotal}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--surface-2)', borderRadius: 6, padding: '3px 8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            {favName} {probToAmericanOdds(Math.max(prediction.winProbA, 1 - prediction.winProbA))}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: tierColor, background: tierBg, padding: '3px 8px', borderRadius: 6 }}>
            {tier}
          </span>
          {prediction.mlValue && (
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>★ Value</span>
          )}
        </div>
      )}
      {!prediction && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>No model data available</div>
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
  const [rankingsUpdated, setRankingsUpdated] = useState('');
  const [teamsUpdated, setTeamsUpdated] = useState('');
  const [weights, setWeights] = useState<ModelWeights>(DEFAULT_WEIGHTS);
  const [activeTab, setActiveTab] = useState('slate');
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [showWeights, setShowWeights] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayET());
  const [useSOS, setUseSOS] = useState(true);
  const [refreshing, setRefreshing] = useState<'rankings' | 'stats' | null>(null);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [backtestInput, setBacktestInput] = useState('');
  const [backtestResults, setBacktestResults] = useState<BacktestResult[] | null>(null);
  // ─── FULL SEASON BACKTEST STATE ───
  const [fullBacktest, setFullBacktest] = useState<any>(null);
  const [fullBacktestLoading, setFullBacktestLoading] = useState(false);
  const [fullBacktestError, setFullBacktestError] = useState('');
  const [btGameFilter, setBtGameFilter] = useState<'all' | 'strong' | 'lean' | 'tossup' | 'wrong'>('all');

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
        if (rankData.rankings?.length > 0) {
          setRankings(rankData.rankings);
          setAlsoConsidered(rankData.alsoConsidered || []);
          setRankingsWeek(rankData.weekLabel || '');
        }
        if (rankData.updated) setRankingsUpdated(rankData.updated);
        if (teamsData.updated) setTeamsUpdated(teamsData.updated);
      } catch (err) { console.error('Failed to load:', err); }
      finally { setLoading(false); }
    }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToDate(date: string) { setSelectedDate(date); fetchSchedule(date); }
  function goPrev() { goToDate(shiftDate(selectedDate, -1)); }
  function goNext() { goToDate(shiftDate(selectedDate, 1)); }
  function goToday() { goToDate(getTodayET()); }

  async function handleRefresh(target: 'rankings' | 'stats') {
    setRefreshing(target);
    setRefreshMsg('');
    try {
      const res = await fetch(`/api/admin/refresh?target=${target}`, { method: 'POST' });
      const data = await res.json();
      if (target === 'rankings' && data.rankings?.success) {
        const rankRes = await fetch('/api/rankings');
        const rankData = await rankRes.json();
        if (rankData.rankings?.length > 0) {
          setRankings(rankData.rankings);
          setAlsoConsidered(rankData.alsoConsidered || []);
          setRankingsWeek(rankData.weekLabel || '');
          setRankingsUpdated(rankData.updated || '');
        }
        setRefreshMsg('Rankings updated successfully');
      } else if (target === 'stats' && data.stats?.success) {
        const teamsRes = await fetch('/api/teams');
        const teamsData = await teamsRes.json();
        if (teamsData.teams?.length > 0) {
          setTeams(teamsData.teams);
          setTeamsUpdated(teamsData.updated || '');
        }
        setRefreshMsg(`Stats updated — ${data.stats.teamsCount} teams`);
      } else {
        const errDetail = target === 'rankings' ? data.rankings?.error : data.stats?.error;
        setRefreshMsg(`Refresh failed: ${errDetail || 'unknown error'}`);
      }
    } catch (err: any) {
      setRefreshMsg(`Refresh failed: ${err.message}`);
    } finally {
      setRefreshing(null);
    }
  }

  function runBacktest() {
    const lines = backtestInput.split(/[;\n]+/).map(l => l.trim()).filter(Boolean);
    const results: BacktestResult[] = [];
    for (const line of lines) {
      const m = line.match(/^(.+?)\s+(\d+)\s+vs\s+(.+?)\s+(\d+)$/i);
      if (!m) continue;
      const [, t1raw, s1, t2raw, s2] = m;
      const score1 = parseInt(s1), score2 = parseInt(s2);
      const actualMargin = score1 - score2;
      const matched1 = findTeamName(t1raw.trim());
      const matched2 = findTeamName(t2raw.trim());
      const teamObj1 = matched1 ? teams.find(t => t.name === matched1) : null;
      const teamObj2 = matched2 ? teams.find(t => t.name === matched2) : null;
      let predictedSpread = 0;
      const modelHasData = !!(teamObj1 && teamObj2);
      if (teamObj1 && teamObj2) {
        const pred = predictMatchup(teamObj1, teamObj2, weights, useSOS);
        predictedSpread = pred.spread;
      }
      const error = Math.abs(predictedSpread - actualMargin);
      const directionCorrect = (predictedSpread >= 0 && actualMargin >= 0) || (predictedSpread < 0 && actualMargin < 0);
      results.push({ input: line, team1: t1raw.trim(), team2: t2raw.trim(), score1, score2, matched1, matched2, predictedSpread, actualMargin, error, directionCorrect, modelHasData });
    }
    setBacktestResults(results);
  }

  const sortedTeams = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);
  const teamA = teams.find(t => t.name === teamAName);
  const teamB = teams.find(t => t.name === teamBName);
  const prediction = useMemo(() => teamA && teamB ? predictMatchup(teamA, teamB, weights, useSOS) : null, [teamA, teamB, weights, useSOS]);
  const updateWeight = useCallback((key: string, val: number) => setWeights(prev => ({ ...prev, [key]: val })), []);

  const findTeamName = useCallback((espnName: string): string | null => {
    if (!espnName) return null;
    const lower = espnName.toLowerCase();

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
    const sortedAliases = [...ALIASES].sort((a, b) => b[0].length - a[0].length);
    for (const [alias, kvName] of sortedAliases) {
      if (lower.includes(alias)) {
        const match = teams.find(t => t.name === kvName);
        if (match) return match.name;
      }
    }

    const exact = teams.find(t => t.name.toLowerCase() === lower);
    if (exact) return exact.name;

    function norm(s: string): string {
      return s.toLowerCase()
        .replace(/\bu\.\s*/g, 'university ')
        .replace(/\bstate\b/g, 'st')
        .replace(/\bst\.\s*/g, 'st ')
        .trim();
    }

    function stripMascot(s: string): string {
      return s.replace(/\s+(black knights|blue jays|scarlet knights|tar heels|orange|orangemen|cavaliers|fighting irish|big green|terriers|crimson|hoyas|pioneers|retrievers|bulldogs|bears|tigers|lions|eagles|hawks|cardinals|wildcats|wolverines|aggies|huskies|panthers|rams|red storm|wolfpack|demon deacons|yellow jackets|greyhounds|jaspers|warriors|seahawks|vikings|colonials|keydets|bobcats|royals|dolphins|sharks|lakers|river hawks|titans|falcons|knights|golden eagles|statesmen|blue hens|red foxes|seawolves|bonnies|gaels|golden griffins|stags|pride|crusaders|midshipmen|big red|quakers|minutemen|buckeyes|terrapins|catamounts|spiders|saints|great danes|raiders|leopards|bearcats|mounties|mountaineers|highlanders|bison|pirates|utes|dragons|nittany lions)$/i, '').trim();
    }

    const espnNorm = norm(lower);
    const espnSchool = norm(stripMascot(lower));

    function bestMatch(candidates: { team: TeamStats; score: number }[]): string | null {
      if (candidates.length === 0) return null;
      const best = new Map<string, { team: TeamStats; score: number }>();
      for (const c of candidates) {
        const existing = best.get(c.team.name);
        if (!existing || c.score > existing.score) best.set(c.team.name, c);
      }
      const sorted = [...best.values()].sort((a, b) => b.score - a.score);
      return sorted[0].team.name;
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
    const schoolResult = bestMatch(schoolMatches);
    if (schoolResult) return schoolResult;

    return null;
  }, [teams]);

  const schedulePredictions = useMemo(() => {
    return schedule.map(game => {
      const awayName = findTeamName(game.away);
      const homeName = findTeamName(game.home);
      const awayTeam = awayName ? teams.find(t => t.name === awayName) : null;
      const homeTeam = homeName ? teams.find(t => t.name === homeName) : null;
      if (awayTeam && homeTeam) {
        const pred = predictMatchup(awayTeam, homeTeam, weights, useSOS);
        const favIsAway = pred.winProbA >= 0.5;
        const favName = favIsAway ? game.away : game.home;
        const underdogName = favIsAway ? game.home : game.away;
        return { prediction: pred, favName, underdogName, awayTeam, homeTeam };
      }
      return { prediction: null, favName: '', underdogName: '', awayTeam: null, homeTeam: null };
    });
  }, [schedule, teams, weights, findTeamName, useSOS]);

  function handleSlateClick(awayEspn: string, homeEspn: string) {
    const matchA = findTeamName(awayEspn);
    const matchB = findTeamName(homeEspn);
    if (matchA) setTeamAName(matchA);
    if (matchB) setTeamBName(matchB);
    setActiveTab('predict');
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--text-dim)', fontSize: 14 }}>
      Loading...
    </div>
  );

  const tabs = [{ key: 'slate', label: 'Schedule' }, { key: 'predict', label: 'Predictor' }, { key: 'rankings', label: 'Rankings' }, { key: 'backtest', label: 'Backtest' }];

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    overflow: 'hidden',
  };

  const selectStyle: React.CSSProperties = {
    width: '100%', marginTop: 6, padding: '11px 36px 11px 14px',
    background: 'var(--surface)', color: 'var(--text-primary)',
    border: '1px solid var(--border)', borderRadius: 10,
    fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-body)',
    boxShadow: 'var(--shadow)', cursor: 'pointer',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {!disclaimerAccepted && <DisclaimerPopup onAccept={handleAcceptDisclaimer} />}

      {/* ─── HEADER ─── */}
      <div style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)', padding: '16px 32px', position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: -0.3 }}>
              Lax Edge
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-dim)', fontWeight: 400 }}>
              NCAA D1 Men's Lacrosse Analytics
            </p>
          </div>
        </div>
      </div>

      {/* ─── TABS ─── */}
      <div style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setRefreshMsg(''); }}
              style={{
                padding: '13px 24px', background: 'transparent', border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-dim)',
                fontSize: 14, fontWeight: 500, fontFamily: 'var(--font-body)',
                cursor: 'pointer', transition: 'color 0.15s', letterSpacing: 0,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── CONTENT ─── */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px 60px' }}>

        {/* ═══ SCHEDULE ═══ */}
        {activeTab === 'slate' && (
          <div>
            <div style={{
              ...card, marginBottom: 16, padding: '12px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Strength of Schedule Adjustment</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 1 }}>
                  {useSOS ? 'Stats adjusted for opponent quality' : 'Raw stats only'}
                </div>
              </div>
              <div onClick={() => setUseSOS(!useSOS)} style={{ width: 44, height: 26, borderRadius: 13, cursor: 'pointer', background: useSOS ? 'var(--accent)' : 'var(--bar-bg)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 3, left: useSOS ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button onClick={goPrev} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 16, padding: '8px 14px', cursor: 'pointer', boxShadow: 'var(--shadow)', fontFamily: 'var(--font-body)', lineHeight: 1 }}>‹</button>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{formatDateDisplay(selectedDate)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{scheduleLoading ? 'Loading...' : `${schedule.length} game${schedule.length !== 1 ? 's' : ''}`}</div>
                {!isToday(selectedDate) && (
                  <button onClick={goToday} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', marginTop: 2, padding: 0, fontFamily: 'var(--font-body)', fontWeight: 500 }}>Back to today</button>
                )}
              </div>
              <button onClick={goNext} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 16, padding: '8px 14px', cursor: 'pointer', boxShadow: 'var(--shadow)', fontFamily: 'var(--font-body)', lineHeight: 1 }}>›</button>
            </div>

            {scheduleLoading && <div style={{ ...card, padding: '40px 20px', textAlign: 'center' }}><div style={{ fontSize: 14, color: 'var(--text-dim)' }}>Loading schedule...</div></div>}
            {!scheduleLoading && schedule.length === 0 && (
              <div style={{ ...card, padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No games today</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Try a different date or use the Predictor tab</div>
              </div>
            )}
            {!scheduleLoading && schedule.length > 0 && (
              <>
                <div style={{ ...card }}>
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>Matchup & Lax Edge Line {useSOS && <span style={{ color: 'var(--accent)' }}>· SOS</span>}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tap to analyze</span>
                  </div>
                  {schedule.map((g, i) => {
                    const sp = schedulePredictions[i];
                    return <GameCard key={i} game={g} prediction={sp?.prediction || null} favName={sp?.favName || ''} underdogName={sp?.underdogName || ''} onClickAnalyze={() => handleSlateClick(g.away, g.home)} index={i} total={schedule.length} />;
                  })}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', padding: '0 4px' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Confidence:</span>
                  <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>Strong</span>
                  <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>Lean</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Toss-up</span>
                  <span style={{ fontSize: 12, color: 'var(--green)' }}>★ Value = strong ML edge</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ PREDICTOR ═══ */}
        {activeTab === 'predict' && (
          <div>
            <div style={{ ...card, marginBottom: 20, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Strength of Schedule Adjustment</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 1 }}>{useSOS ? 'Stats adjusted for opponent quality' : 'Raw stats only'}</div>
              </div>
              <div onClick={() => setUseSOS(!useSOS)} style={{ width: 44, height: 26, borderRadius: 13, cursor: 'pointer', background: useSOS ? 'var(--accent)' : 'var(--bar-bg)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 3, left: useSOS ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start', marginBottom: 24 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Away Team</label>
                <select value={teamAName} onChange={e => setTeamAName(e.target.value)} style={selectStyle}>
                  {sortedTeams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
                {useSOS && teamA && (() => { const tier = getSOSTier(teamA); return <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: tier.color, background: tier.color + '18', padding: '2px 8px', borderRadius: 5 }}>{tier.label}</span><span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{tier.multiplier}×</span></div>; })()}
              </div>
              <div style={{ fontSize: 18, color: 'var(--text-muted)', fontWeight: 500, marginTop: 28, userSelect: 'none' }}>vs</div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Home Team</label>
                <select value={teamBName} onChange={e => setTeamBName(e.target.value)} style={selectStyle}>
                  {sortedTeams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
                {useSOS && teamB && (() => { const tier = getSOSTier(teamB); return <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 11, fontWeight: 600, color: tier.color, background: tier.color + '18', padding: '2px 8px', borderRadius: 5 }}>{tier.label}</span><span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{tier.multiplier}×</span></div>; })()}
              </div>
            </div>

            {prediction && teamA && teamB && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Spread', value: prediction.spread > 0 ? `${teamAName} -${Math.abs(prediction.spread)}` : prediction.spread < 0 ? `${teamBName} -${Math.abs(prediction.spread)}` : 'Pick', sub: prediction.spread !== 0 ? `${prediction.spread > 0 ? teamAName : teamBName} favored` : 'Even matchup', color: 'var(--green)' },
                    { label: 'Total', value: String(prediction.projTotal), sub: `${Math.round(prediction.projTotal / 2 + Math.abs(prediction.spread) / 2)}–${Math.round(prediction.projTotal / 2 - Math.abs(prediction.spread) / 2)} proj`, color: 'var(--amber)' },
                    { label: 'Win Probability', value: `${Math.round(Math.max(prediction.winProbA, 1 - prediction.winProbA) * 100)}%`, sub: `${prediction.winProbA >= 0.5 ? teamAName : teamBName} ${probToAmericanOdds(Math.max(prediction.winProbA, 1 - prediction.winProbA))}${prediction.mlValue ? ' ★' : ''}`, color: 'var(--accent)' },
                  ].map((item, i) => (
                    <div key={i} style={{ ...card, padding: '20px 18px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{item.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 700, color: item.color, lineHeight: 1, fontFamily: 'var(--font-mono)', letterSpacing: -0.5 }}>{item.value}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>{item.sub}</div>
                    </div>
                  ))}
                </div>

                <div style={{ ...card, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Confidence</span>
                  <div style={{ flex: 1 }}><StatBar value={prediction.confidence} max={100} color={prediction.confidence > 70 ? 'var(--green)' : prediction.confidence > 50 ? 'var(--amber)' : 'var(--red)'} /></div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{prediction.confidence}%</span>
                </div>

                <div style={{ ...card, padding: '20px 20px', marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>Head-to-Head Stats</div>
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
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 110px 1fr 72px', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ textAlign: 'right', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: aWins ? 'var(--green)' : 'var(--text-dim)' }}>{row.fmt(row.a)}</span>
                        <div style={{ height: 3, borderRadius: 2, background: aWins ? 'var(--green)' : 'var(--bar-bg)', opacity: aWins ? 0.7 : 1 }} />
                        <span style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', fontWeight: 500 }}>{row.label}</span>
                        <div style={{ height: 3, borderRadius: 2, background: bWins ? 'var(--green)' : 'var(--bar-bg)', opacity: bWins ? 0.7 : 1 }} />
                        <span style={{ textAlign: 'left', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: bWins ? 'var(--green)' : 'var(--text-dim)' }}>{row.fmt(row.b)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <button onClick={() => setShowWeights(!showWeights)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', width: '100%', color: 'var(--text-dim)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left', boxShadow: 'var(--shadow)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-body)' }}>
              <span>Model Weights</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{showWeights ? 'Hide' : 'Show'}</span>
            </button>
            {showWeights && (
              <div style={{ ...card, padding: '20px 20px', marginTop: 8 }}>
                <WeightSlider label="Face-Off %" value={weights.faceOff} onChange={v => updateWeight('faceOff', v)} accent="var(--accent)" />
                <WeightSlider label="Clear %" value={weights.clearPct} onChange={v => updateWeight('clearPct', v)} accent="#5ac8fa" />
                <WeightSlider label="Shot %" value={weights.shotPct} onChange={v => updateWeight('shotPct', v)} accent="var(--green)" />
                <WeightSlider label="TO Margin" value={weights.turnoverMargin} onChange={v => updateWeight('turnoverMargin', v)} accent="var(--amber)" />
                <WeightSlider label="Save %" value={weights.savePct} onChange={v => updateWeight('savePct', v)} accent="var(--red)" />
                <WeightSlider label="Def Efficiency" value={weights.defEff} onChange={v => updateWeight('defEff', v)} accent="#30d158" />
                <WeightSlider label="EMO" value={weights.emo} onChange={v => updateWeight('emo', v)} accent="#bf5af2" />
                <button onClick={() => setWeights(DEFAULT_WEIGHTS)} style={{ marginTop: 10, padding: '8px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--font-body)', fontWeight: 500, cursor: 'pointer' }}>Reset to defaults</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ RANKINGS ═══ */}
        {activeTab === 'rankings' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px', letterSpacing: -0.3 }}>USA Lacrosse Top 20</h2>
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{rankingsWeek || 'Men\'s Division I'}</div>
                {rankingsUpdated && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Updated {new Date(rankingsUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
              </div>
              <button onClick={() => handleRefresh('rankings')} disabled={refreshing === 'rankings'} style={{ padding: '9px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: refreshing === 'rankings' ? 'var(--text-muted)' : 'var(--accent)', fontSize: 13, fontWeight: 500, cursor: refreshing === 'rankings' ? 'default' : 'pointer', boxShadow: 'var(--shadow)', fontFamily: 'var(--font-body)' }}>
                {refreshing === 'rankings' ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>

            {refreshMsg && (
              <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: refreshMsg.includes('failed') ? 'rgba(255,59,48,0.08)' : 'rgba(40,167,69,0.08)', color: refreshMsg.includes('failed') ? 'var(--red)' : 'var(--green)', border: `1px solid ${refreshMsg.includes('failed') ? 'rgba(255,59,48,0.2)' : 'rgba(40,167,69,0.2)'}` }}>
                {refreshMsg}
              </div>
            )}

            {rankings.length === 0 ? (
              <div style={{ ...card, padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Rankings not loaded</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Tap Refresh to pull the latest rankings</div>
              </div>
            ) : (
              <>
                <div style={{ ...card }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 72px 52px', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                    {['#', 'Team', 'Record', 'Prev'].map((h, i) => <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i >= 2 ? 'center' : 'left' }}>{h}</span>)}
                  </div>
                  {rankings.map((r, i) => {
                    const prevNum = parseInt(r.prev);
                    const moved = isNaN(prevNum) ? 'new' : prevNum > r.rank ? 'up' : prevNum < r.rank ? 'down' : 'same';
                    return (
                      <div key={r.rank} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 72px 52px', padding: '13px 16px', borderBottom: i < rankings.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: r.rank <= 5 ? 'var(--accent)' : 'var(--text-muted)' }}>{r.rank}</span>
                        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{r.team}</span>
                        <span style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>{r.record}</span>
                        <span style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: moved === 'up' ? 'var(--green)' : moved === 'down' ? 'var(--red)' : moved === 'new' ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {moved === 'up' ? `▲${prevNum - r.rank}` : moved === 'down' ? `▼${r.rank - prevNum}` : moved === 'new' ? 'NR' : '–'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {alsoConsidered.length > 0 && (
                  <div style={{ ...card, marginTop: 12, padding: '14px 18px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Also Considered</div>
                    <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{alsoConsidered.join(' · ')}</div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6, padding: '0 4px' }}>Rankings compiled by USA Lacrosse Magazine staff and contributors with input from coaches.</div>
                <div style={{ marginTop: 20, ...card, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Team Stats</div>
                    {teamsUpdated && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Updated {new Date(teamsUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
                  </div>
                  <button onClick={() => handleRefresh('stats')} disabled={refreshing === 'stats'} style={{ padding: '8px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: refreshing === 'stats' ? 'var(--text-muted)' : 'var(--text-dim)', fontSize: 13, fontWeight: 500, cursor: refreshing === 'stats' ? 'default' : 'pointer', fontFamily: 'var(--font-body)' }}>
                    {refreshing === 'stats' ? 'Refreshing...' : '↻ Refresh Stats'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ BACKTEST ═══ */}
        {activeTab === 'backtest' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: -0.3 }}>Model Backtest</h2>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Two modes: full season sweep against ESPN data, or paste individual results manually.</p>
            </div>

            {/* ── FULL SEASON BACKTEST ── */}
            <div style={{ ...card, padding: 20, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Full Season Backtest</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Sweeps all completed 2026 D1 games from ESPN (Feb 1 → yesterday)</div>
                </div>
                <button
                  onClick={async () => {
                    setFullBacktestLoading(true);
                    setFullBacktestError('');
                    setFullBacktest(null);
                    try {
                      const res = await fetch('/api/backtest');
                      if (!res.ok) {
                        const err = await res.json();
                        setFullBacktestError(err.error || 'Request failed');
                      } else {
                        setFullBacktest(await res.json());
                      }
                    } catch (e: any) {
                      setFullBacktestError(e.message);
                    } finally {
                      setFullBacktestLoading(false);
                    }
                  }}
                  disabled={fullBacktestLoading}
                  style={{ padding: '10px 20px', background: fullBacktestLoading ? 'var(--bar-bg)' : 'var(--accent)', color: fullBacktestLoading ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: fullBacktestLoading ? 'default' : 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
                >
                  {fullBacktestLoading ? 'Running…' : fullBacktest ? '↻ Re-run' : '▶ Run Full Season'}
                </button>
              </div>

              {fullBacktestError && <div style={{ fontSize: 13, color: 'var(--red)', padding: '8px 12px', background: 'rgba(255,59,48,0.07)', borderRadius: 7 }}>{fullBacktestError}</div>}
              {fullBacktestLoading && <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 0' }}>Fetching ~90 dates from ESPN and running predictions… this takes ~15 seconds.</div>}

              {fullBacktest && !fullBacktestLoading && (() => {
                const fb = fullBacktest;
                const filteredGames = (fb.games || []).filter((g: any) => {
                  if (!g.modelHasData) return btGameFilter === 'all';
                  const diff = Math.abs((g.ratingAway ?? 0) - (g.ratingHome ?? 0));
                  const conf = Math.min(95, Math.round(diff * 4 + 35));
                  if (btGameFilter === 'all') return true;
                  if (btGameFilter === 'strong') return conf >= 70;
                  if (btGameFilter === 'lean') return conf >= 50 && conf < 70;
                  if (btGameFilter === 'tossup') return conf < 50;
                  if (btGameFilter === 'wrong') return !g.directionCorrect;
                  return true;
                });

                return (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fb.totalGames}</span> completed games ·{' '}
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fb.scoredGames}</span> matched ·{' '}
                      <span style={{ color: 'var(--red)' }}>{fb.unmatchedGames}</span> unmatched
                    </div>

                    {/* Row 1 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                      {[
                        { label: 'Direction Accuracy', value: fb.scoredGames > 0 ? `${fb.directCorrect}/${fb.scoredGames}` : '—', sub: fb.scoredGames > 0 ? `${(fb.directionAccuracy * 100).toFixed(1)}%` : '', color: fb.directionAccuracy >= 0.65 ? 'var(--green)' : fb.directionAccuracy >= 0.55 ? 'var(--amber)' : 'var(--red)' },
                        { label: 'Spread MAE', value: fb.scoredGames > 0 ? `±${fb.spreadMAE.toFixed(1)}` : '—', sub: 'mean absolute error', color: fb.spreadMAE <= 4 ? 'var(--green)' : fb.spreadMAE <= 6 ? 'var(--amber)' : 'var(--red)' },
                        { label: 'Total MAE', value: fb.scoredGames > 0 ? `±${fb.totalMAE.toFixed(1)}` : '—', sub: 'goals over/under', color: fb.totalMAE <= 3 ? 'var(--green)' : fb.totalMAE <= 5 ? 'var(--amber)' : 'var(--red)' },
                        { label: 'Model Cover %', value: fb.scoredGames > 0 ? `${(fb.coverPct * 100).toFixed(1)}%` : '—', sub: 'vs ±0.5 flat spread', color: fb.coverPct >= 0.55 ? 'var(--green)' : fb.coverPct >= 0.50 ? 'var(--amber)' : 'var(--red)' },
                      ].map((item, i) => (
                        <div key={i} style={{ ...card, padding: '14px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{item.label}</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: item.color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{item.value}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{item.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Row 2 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                      {[
                        { label: 'Spread Bias', value: fb.scoredGames > 0 ? (fb.spreadBias > 0 ? `+${fb.spreadBias.toFixed(1)}` : fb.spreadBias.toFixed(1)) : '—', sub: Math.abs(fb.spreadBias) <= 1 ? 'well calibrated' : fb.spreadBias > 0 ? 'overestimates fav' : 'underestimates fav', color: Math.abs(fb.spreadBias) <= 1.5 ? 'var(--green)' : Math.abs(fb.spreadBias) <= 3 ? 'var(--amber)' : 'var(--red)' },
                        { label: 'Total Bias', value: fb.scoredGames > 0 ? (fb.totalBias > 0 ? `+${fb.totalBias.toFixed(1)}` : fb.totalBias.toFixed(1)) : '—', sub: Math.abs(fb.totalBias) <= 1 ? 'well calibrated' : fb.totalBias > 0 ? 'over-projects totals' : 'under-projects totals', color: Math.abs(fb.totalBias) <= 1.5 ? 'var(--green)' : Math.abs(fb.totalBias) <= 3 ? 'var(--amber)' : 'var(--red)' },
                        { label: 'Strong Picks', value: fb.strongGames > 0 ? `${fb.strongCorrect}/${fb.strongGames}` : '—', sub: fb.strongGames > 0 ? `${(fb.strongCorrect / fb.strongGames * 100).toFixed(0)}% accuracy` : 'no strong picks', color: fb.strongGames > 0 && fb.strongCorrect / fb.strongGames >= 0.70 ? 'var(--green)' : 'var(--amber)' },
                        { label: 'Lean Picks', value: fb.leanGames > 0 ? `${fb.leanCorrect}/${fb.leanGames}` : '—', sub: fb.leanGames > 0 ? `${(fb.leanCorrect / fb.leanGames * 100).toFixed(0)}% accuracy` : 'no lean picks', color: fb.leanGames > 0 && fb.leanCorrect / fb.leanGames >= 0.60 ? 'var(--green)' : 'var(--amber)' },
                      ].map((item, i) => (
                        <div key={i} style={{ ...card, padding: '14px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{item.label}</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: item.color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{item.value}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{item.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Filter tabs */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      {(['all', 'strong', 'lean', 'tossup', 'wrong'] as const).map(f => (
                        <button key={f} onClick={() => setBtGameFilter(f)} style={{ padding: '6px 14px', borderRadius: 20, background: btGameFilter === f ? 'var(--accent)' : 'var(--surface-2)', color: btGameFilter === f ? '#fff' : 'var(--text-dim)', border: btGameFilter === f ? 'none' : '1px solid var(--border)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                          {f === 'all' ? `All (${fb.scoredGames})` : f === 'strong' ? `Strong (${fb.strongGames})` : f === 'lean' ? `Lean (${fb.leanGames})` : f === 'tossup' ? `Toss-up (${fb.tossupGames})` : `Wrong (${fb.scoredGames - fb.directCorrect})`}
                        </button>
                      ))}
                    </div>

                    {/* Games table */}
                    <div style={{ ...card, maxHeight: 520, overflowY: 'auto' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr 70px 80px 80px 48px 48px', padding: '9px 14px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>
                        {['Date', 'Matchup', 'Score', 'Spread', 'Total', 'Err', ''].map((h, i) => <span key={i} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i >= 2 ? 'center' : 'left' }}>{h}</span>)}
                      </div>
                      {filteredGames.length === 0 && <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No games match this filter.</div>}
                      {filteredGames.map((g: any, i: number) => {
                        const diff = Math.abs((g.ratingAway ?? 0) - (g.ratingHome ?? 0));
                        const conf = Math.min(95, Math.round(diff * 4 + 35));
                        const tier = conf >= 70 ? 'STRONG' : conf >= 50 ? 'LEAN' : 'TOSS-UP';
                        const tierColor = tier === 'STRONG' ? 'var(--green)' : tier === 'LEAN' ? 'var(--amber)' : 'var(--text-muted)';
                        const spreadErrColor = g.spreadError <= 3 ? 'var(--green)' : g.spreadError <= 6 ? 'var(--amber)' : 'var(--red)';
                        return (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '88px 1fr 70px 80px 80px 48px 48px', padding: '11px 14px', alignItems: 'center', borderBottom: i < filteredGames.length - 1 ? '1px solid var(--border)' : 'none', background: !g.modelHasData ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{g.date.slice(5)}</span>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: g.modelHasData ? 'var(--text-primary)' : 'var(--text-muted)' }}>{g.awayEspn} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>at</span> {g.homeEspn}</div>
                              {g.modelHasData && <div style={{ fontSize: 10, color: tierColor, fontWeight: 600, marginTop: 1 }}>{tier}</div>}
                              {!g.modelHasData && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 1 }}>{!g.awayMatched ? `"${g.awayEspn}" unmatched` : `"${g.homeEspn}" unmatched`}</div>}
                            </div>
                            <span style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{g.awayScore}–{g.homeScore}</span>
                            <div style={{ textAlign: 'center' }}>
                              {g.modelHasData ? (<><div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>{g.predictedSpread === 0 ? 'PK' : `${g.predictedSpread > 0 ? g.awayMatched?.split(' ')[0] : g.homeMatched?.split(' ')[0]} -${Math.abs(g.predictedSpread)}`}</div><div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>actual {g.actualMargin > 0 ? '+' : ''}{g.actualMargin}</div></>) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              {g.modelHasData ? (<><div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)' }}>{g.predictedTotal}</div><div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>actual {g.actualTotal}</div></>) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                            </div>
                            <span style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: g.modelHasData ? spreadErrColor : 'var(--text-muted)' }}>{g.modelHasData ? `±${g.spreadError.toFixed(1)}` : '—'}</span>
                            <span style={{ textAlign: 'center', fontSize: 14 }}>{g.modelHasData ? (g.directionCorrect ? '✓' : '✗') : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, padding: '0 2px' }}>
                      Predictions use current-season stats — not the stats that existed on each game date. Treat as calibration, not true out-of-sample validation.
                    </div>
                  </>
                );
              })()}
            </div>

            {/* ── MANUAL BACKTEST ── */}
            <div style={{ ...card, padding: '14px 18px', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Manual Backtest</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Paste specific results. Format: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 4 }}>Team1 Score vs Team2 Score</span>, one per line.</div>
            </div>

            <div style={{ ...card, padding: 20, marginBottom: 16 }}>
              <textarea value={backtestInput} onChange={e => setBacktestInput(e.target.value)} placeholder={`Virginia 16 vs UNC 6\nArmy 14 vs Loyola Maryland 7\nPrinceton 19 vs Cornell 9`} rows={6} style={{ width: '100%', padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', resize: 'vertical', outline: 'none', lineHeight: 1.6 }} />
              <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
                <button onClick={runBacktest} style={{ padding: '10px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Run Backtest</button>
                {backtestResults && <button onClick={() => setBacktestResults(null)} style={{ padding: '10px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Clear</button>}
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Uses current weights & SOS setting</span>
              </div>
            </div>

            {backtestResults && (() => {
              const scored = backtestResults.filter(r => r.modelHasData);
              const correct = scored.filter(r => r.directionCorrect).length;
              const mae = scored.length > 0 ? scored.reduce((s, r) => s + r.error, 0) / scored.length : 0;
              const bias = scored.length > 0 ? scored.reduce((s, r) => s + (r.predictedSpread - r.actualMargin), 0) / scored.length : 0;
              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                    {[
                      { label: 'Pick Accuracy', value: scored.length > 0 ? `${correct}/${scored.length}` : '—', sub: scored.length > 0 ? `${Math.round(correct / scored.length * 100)}%` : '', color: correct / scored.length >= 0.7 ? 'var(--green)' : correct / scored.length >= 0.5 ? 'var(--amber)' : 'var(--red)' },
                      { label: 'Avg Spread Error', value: scored.length > 0 ? `±${mae.toFixed(1)}` : '—', sub: 'mean absolute error', color: mae <= 4 ? 'var(--green)' : mae <= 7 ? 'var(--amber)' : 'var(--red)' },
                      { label: 'Model Bias', value: scored.length > 0 ? (bias > 0 ? `+${bias.toFixed(1)}` : bias.toFixed(1)) : '—', sub: bias > 0.5 ? 'overestimates favorites' : bias < -0.5 ? 'underestimates favorites' : 'well calibrated', color: Math.abs(bias) <= 1.5 ? 'var(--green)' : Math.abs(bias) <= 3 ? 'var(--amber)' : 'var(--red)' },
                    ].map((item, i) => (
                      <div key={i} style={{ ...card, padding: '18px 16px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{item.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: item.color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{item.value}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5 }}>{item.sub}</div>
                      </div>
                    ))}
                  </div>
                  {scored.length >= 3 && (() => {
                    const avgActual = scored.reduce((s, r) => s + Math.abs(r.actualMargin), 0) / scored.length;
                    const avgPredicted = scored.reduce((s, r) => s + Math.abs(r.predictedSpread), 0) / scored.length;
                    const ratio = avgActual / (avgPredicted || 1);
                    const suggestedScalar = Math.round(0.38 * ratio * 100) / 100;
                    if (Math.abs(ratio - 1) > 0.15) {
                      return (
                        <div style={{ ...card, padding: '14px 18px', marginBottom: 16 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Spread Scalar Suggestion</div>
                          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Model spreads avg <strong>{avgPredicted.toFixed(1)} pts</strong> vs actuals avg <strong>{avgActual.toFixed(1)} pts</strong>. Try scalar <span style={{ fontFamily: 'var(--font-mono)' }}>0.38</span> → <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{suggestedScalar}</span>.</div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  <div style={{ ...card }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 70px 70px', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                      {['Matchup', 'Actual', 'Model', 'Error', ''].map((h, i) => <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i > 0 ? 'center' : 'left' }}>{h}</span>)}
                    </div>
                    {backtestResults.map((r, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 70px 70px', padding: '13px 16px', alignItems: 'center', borderBottom: i < backtestResults.length - 1 ? '1px solid var(--border)' : 'none', background: !r.modelHasData ? 'rgba(0,0,0,0.02)' : 'transparent' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: r.modelHasData ? 'var(--text-primary)' : 'var(--text-muted)' }}>{r.team1} vs {r.team2}</div>
                          {!r.modelHasData && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>{!r.matched1 ? `"${r.team1}" not found` : `"${r.team2}" not found`}</div>}
                        </div>
                        <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{r.score1}–{r.score2}</div>
                        <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: r.modelHasData ? 'var(--text-dim)' : 'var(--text-muted)' }}>{r.modelHasData ? (r.predictedSpread === 0 ? 'PK' : `${r.predictedSpread > 0 ? r.team1 : r.team2} -${Math.abs(r.predictedSpread)}`) : '—'}</div>
                        <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: r.modelHasData ? (r.error <= 3 ? 'var(--green)' : r.error <= 6 ? 'var(--amber)' : 'var(--red)') : 'var(--text-muted)' }}>{r.modelHasData ? `±${r.error.toFixed(1)}` : '—'}</div>
                        <div style={{ textAlign: 'center', fontSize: 14 }}>{r.modelHasData ? (r.directionCorrect ? '✓' : '✗') : ''}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1.6 }}>Note: backtest uses current-season stats. Treat as calibration, not true out-of-sample validation.</div>
                </>
              );
            })()}
          </div>
        )}

        {/* ─── FOOTER ─── */}
        <div style={{ marginTop: 48, paddingTop: 20, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8, maxWidth: 560, margin: '0 auto' }}>
            For informational and entertainment purposes only. All predictions are probabilistic estimates based on publicly available NCAA data and are not guarantees of any outcome.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Lax Edge v5.0</div>
        </div>
      </div>
    </div>
  );
}
