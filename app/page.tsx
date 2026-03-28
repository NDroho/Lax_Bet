'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TeamStats, ModelWeights, DEFAULT_WEIGHTS, computePowerRating, predictMatchup, SlateGame } from '@/lib/model';

// ─── TYPES ───

interface RankingEntry {
  rank: number;
  team: string;
  record: string;
  prev: string;
}

// ─── HELPER COMPONENTS ───

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

// ─── MAIN DASHBOARD ───

export default function Dashboard() {
  const [teams, setTeams] = useState<TeamStats[]>([]);
  const [schedule, setSchedule] = useState<SlateGame[]>([]);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [alsoConsidered, setAlsoConsidered] = useState<string[]>([]);
  const [rankingsWeek, setRankingsWeek] = useState('');
  const [weights, setWeights] = useState<ModelWeights>(DEFAULT_WEIGHTS);
  const [activeTab, setActiveTab] = useState('slate');
  const [teamsUpdated, setTeamsUpdated] = useState<string | null>(null);
  const [scheduleUpdated, setScheduleUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [showWeights, setShowWeights] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [teamsRes, schedRes, rankRes] = await Promise.all([
          fetch('/api/teams'),
          fetch('/api/schedule'),
          fetch('/api/rankings'),
        ]);
        const teamsData = await teamsRes.json();
        const schedData = await schedRes.json();
        const rankData = await rankRes.json();

        if (teamsData.teams?.length > 0) {
          setTeams(teamsData.teams);
          setTeamsUpdated(teamsData.updated);
          setTeamAName(teamsData.teams[0]?.name || '');
          if (teamsData.teams.length > 1) setTeamBName(teamsData.teams[1]?.name || '');
        }
        if (schedData.games?.length > 0) {
          setSchedule(schedData.games);
          setScheduleUpdated(schedData.updated);
        }
        if (rankData.rankings?.length > 0) {
          setRankings(rankData.rankings);
          setAlsoConsidered(rankData.alsoConsidered || []);
          setRankingsWeek(rankData.weekLabel || '');
        }
      } catch (err) {
        console.error('Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const sortedTeams = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);
  const teamA = teams.find(t => t.name === teamAName);
  const teamB = teams.find(t => t.name === teamBName);
  const prediction = useMemo(() => teamA && teamB ? predictMatchup(teamA, teamB, weights) : null, [teamA, teamB, weights]);
  const updateWeight = useCallback((key: string, val: number) => setWeights(prev => ({ ...prev, [key]: val })), []);

  const findTeam = useCallback((name: string) =>
    teams.find(t =>
      t.name.toLowerCase() === name.toLowerCase() ||
      t.name.toLowerCase().includes(name.toLowerCase()) ||
      name.toLowerCase().includes(t.name.toLowerCase())
    ), [teams]);

  const slatePredictions = useMemo(() =>
    schedule.map(g => {
      const tA = findTeam(g.away);
      const tB = findTeam(g.home);
      if (!tA || !tB) return { ...g, pred: null };
      return { ...g, pred: predictMatchup(tA, tB, weights) };
    }), [schedule, teams, weights, findTeam]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
      Loading LAX EDGE...
    </div>
  );

  const tabs = [
    { key: 'slate', label: "TODAY'S SLATE" },
    { key: 'predict', label: 'PREDICTOR' },
    { key: 'rankings', label: 'RANKINGS' },
  ];

  return (
    <div>
      {/* ─── HEADER ─── */}
      <div style={{ background: 'linear-gradient(135deg, #0d1420 0%, #162030 50%, #0d1825 100%)', borderBottom: '1px solid var(--border)', padding: '20px 24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, letterSpacing: 2, color: 'var(--accent)', margin: 0, lineHeight: 1 }}>LAX EDGE</h1>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>NCAA D1 MEN'S LACROSSE</span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-dim)' }}>Matchup predictor & daily picks</p>
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Stats: {teamsUpdated ? new Date(teamsUpdated).toLocaleDateString() : 'Pending'} · Schedule: {scheduleUpdated ? new Date(scheduleUpdated).toLocaleDateString() : 'Pending'} · {teams.length} teams
        </div>
      </div>

      {/* ─── TABS ─── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            flex: 1, padding: '12px', background: activeTab === tab.key ? 'var(--surface)' : 'transparent',
            color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-dim)', border: 'none',
            borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5, cursor: 'pointer', transition: 'all 0.2s',
          }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>

        {/* ═══════════════════ TODAY'S SLATE ═══════════════════ */}
        {activeTab === 'slate' && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, marginBottom: 16 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </div>

            {slatePredictions.length === 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 8 }}>No games scheduled for today</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Check back on game days or use the Predictor tab</div>
              </div>
            )}

            {slatePredictions.map((g, i) => (
              <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{g.away}</span>
                    <span style={{ color: 'var(--text-muted)', margin: '0 8px', fontSize: 13 }}>at</span>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{g.home}</span>
                    {g.note && <span style={{ marginLeft: 10, fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{g.note}</span>}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {g.time !== 'TBD' ? g.time : ''}{g.tv ? ` · ${g.tv}` : ''}
                  </div>
                </div>

                {g.pred && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
                    {(() => {
                      const fav = g.pred.spread > 0 ? g.away : g.pred.spread < 0 ? g.home : 'PICK';
                      const spreadAbs = Math.abs(g.pred.spread);
                      return [
                        { l: 'SPREAD', v: spreadAbs === 0 ? 'PICK' : `${fav} -${spreadAbs}`, c: 'var(--green)' },
                        { l: 'TOTAL', v: String(g.pred.projTotal), c: 'var(--amber)' },
                        { l: 'WIN PROB', v: `${Math.round(Math.max(g.pred.winProbA, 1 - g.pred.winProbA) * 100)}%`, c: 'var(--accent)' },
                      ];
                    })().map((c, j) => (
                      <div key={j} style={{ background: 'var(--surface-2)', borderRadius: 6, padding: '10px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 4 }}>{c.l}</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: c.c }}>{c.v}</div>
                      </div>
                    ))}
                  </div>
                )}

                {!g.pred && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Team data not available for prediction
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════ PREDICTOR ═══════════════════ */}
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
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 38, lineHeight: 1, color: prediction.spread !== 0 ? 'var(--green)' : 'var(--text-primary)' }}>
                      {prediction.spread > 0 ? `${teamAName.split(' ').pop()} -${Math.abs(prediction.spread)}` : prediction.spread < 0 ? `${teamBName.split(' ').pop()} -${Math.abs(prediction.spread)}` : 'PICK'}
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

        {/* ═══════════════════ RANKINGS ═══════════════════ */}
        {activeTab === 'rankings' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5 }}>
                USA LACROSSE DI MEN'S TOP 20
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                {rankingsWeek || 'Loading...'}
              </div>
            </div>

            {rankings.length === 0 ? (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '40px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 8 }}>Rankings not yet loaded</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Rankings update every Wednesday</div>
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

        {/* ─── FOOTER ─── */}
        <div style={{ marginTop: 32, padding: '16px 0', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'center', letterSpacing: 0.5, lineHeight: 1.8 }}>
          LAX EDGE v2.0 — NCAA D1 Men's Lacrosse Predictions<br />
          Not financial advice. Bet responsibly.
        </div>
      </div>
    </div>
  );
}
