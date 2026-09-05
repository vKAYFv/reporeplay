import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { HistoryPoint, ProfileStats } from '@kayf/profile-counter-shared';
import './styles.css';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const exact = new Intl.NumberFormat('en');

function Sparkline({ points, field, color }: { points: HistoryPoint[]; field: keyof HistoryPoint; color: string }) {
  const values = points.map((point) => Number(point[field]));
  const max = Math.max(1, ...values);
  const coordinates = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${34 - (value / max) * 30}`).join(' ');
  return <svg className="spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-label={`${String(field)} over time`}><polyline points={coordinates} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'green' | 'purple' | 'red' }) {
  return <div className={`metric ${tone ?? ''}`}><span>{label}</span><strong>{compact.format(value)}</strong><small>{exact.format(value)}</small></div>;
}

function ProfilePanel({ profile, apiKey, refresh }: { profile: ProfileStats; apiKey: string; refresh: () => void }) {
  const [resetting, setResetting] = useState(false);
  const reset = async () => {
    if (!window.confirm(`Reset all counters and analytics for ${profile.profile}?`)) return;
    setResetting(true);
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profile.profile)}/reset`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ scope: 'all' }),
      });
      if (!response.ok) throw new Error(`Reset failed (${response.status})`);
      refresh();
    } finally { setResetting(false); }
  };
  return <section className="panel">
    <div className="panel-head"><div><span className="eyebrow">PROFILE</span><h2>{profile.profile}</h2></div><button className="danger" disabled={resetting} onClick={reset}>{resetting ? 'Resetting…' : 'Reset all'}</button></div>
    <div className="metrics">
      <Metric label="Visible count" value={profile.countedViews} tone="amber" />
      <Metric label="Raw requests" value={profile.rawRequests} />
      <Metric label="Unique" value={profile.uniqueViews} tone="green" />
      <Metric label="Repeated" value={profile.repeatViews} />
      <Metric label="Bots" value={profile.botRequests} tone="purple" />
      <Metric label="Rate limited" value={profile.rateLimited} tone="red" />
      <Metric label="Requests / min" value={profile.requestsPerMinute} />
      <Metric label="Requests / hour" value={profile.requestsPerHour} />
      <Metric label="Views today" value={profile.viewsToday} />
      <Metric label="Views / 24h" value={profile.viewsLast24h} />
    </div>
    <div className="charts">
      <article><header><span>Traffic · 60 minutes</span><b>{exact.format(profile.trafficLast60Minutes.reduce((sum, p) => sum + p.raw, 0))}</b></header><Sparkline points={profile.trafficLast60Minutes} field="raw" color="#58a6ff" /></article>
      <article><header><span>Counted · 30 days</span><b>{exact.format(profile.last30Days.reduce((sum, p) => sum + p.counted, 0))}</b></header><Sparkline points={profile.last30Days} field="counted" color="#f7b93e" /></article>
      <article><header><span>Unique / repeated · 7 days</span><b>{exact.format(profile.last7Days.reduce((sum, p) => sum + p.unique, 0))} unique</b></header><div className="dual"><Sparkline points={profile.last7Days} field="unique" color="#56d4a1" /><Sparkline points={profile.last7Days} field="repeat" color="#a38bff" /></div></article>
      <article><header><span>Rejected · 30 days</span><b>{exact.format(profile.last30Days.reduce((sum, p) => sum + p.rateLimited, 0))}</b></header><Sparkline points={profile.last30Days} field="rateLimited" color="#ff6b7a" /></article>
    </div>
  </section>;
}

function App() {
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('profile-counter-api-key') ?? '');
  const [draftKey, setDraftKey] = useState(apiKey);
  const [profiles, setProfiles] = useState<ProfileStats[]>([]);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<Date>();
  const load = useCallback(async () => {
    if (!apiKey) return;
    try {
      const response = await fetch('/api/admin/profiles', { headers: { 'x-api-key': apiKey } });
      if (response.status === 401) throw new Error('The admin API key is not valid.');
      if (!response.ok) throw new Error(`API unavailable (${response.status})`);
      const body = await response.json() as { profiles: ProfileStats[] };
      setProfiles(body.profiles); setError(''); setUpdated(new Date());
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load profiles'); }
  }, [apiKey]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 5_000); return () => window.clearInterval(timer); }, [load]);
  const totals = useMemo(() => profiles.reduce((sum, profile) => sum + profile.rawRequests, 0), [profiles]);
  if (!apiKey) return <main className="login"><form onSubmit={(event) => { event.preventDefault(); sessionStorage.setItem('profile-counter-api-key', draftKey); setApiKey(draftKey); }}><span className="logo">PV</span><h1>Counter admin</h1><p>Enter the API key configured as <code>ADMIN_API_KEY</code>. It stays in this browser tab.</p><input type="password" autoFocus minLength={16} value={draftKey} onChange={(event) => setDraftKey(event.target.value)} placeholder="Admin API key" /><button>Open dashboard</button></form></main>;
  return <main className="shell"><header className="topbar"><div><span className="logo">PV</span><div><h1>Profile Counter</h1><p>{profiles.length} profiles · {exact.format(totals)} requests</p></div></div><aside><span className={error ? 'status error' : 'status'}>{error || `Live · ${updated?.toLocaleTimeString() ?? 'connecting'}`}</span><button onClick={() => { sessionStorage.removeItem('profile-counter-api-key'); setApiKey(''); }}>Lock</button></aside></header>
    {profiles.length === 0 && !error ? <div className="empty"><h2>No traffic yet</h2><p>Open a badge URL to create the first profile.</p></div> : profiles.map((profile) => <ProfilePanel key={profile.profile} profile={profile} apiKey={apiKey} refresh={() => void load()} />)}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
