import React, { useEffect, useMemo, useRef, useState } from 'react';

const KINDS = [
  { id: 'c2c', label: 'C2C sweep', hint: 'LinkedIn 8 queries + Groups + inbox' },
  { id: 'inbox', label: 'Inbox check', hint: 'Gmail + C2C Groups only' },
  { id: 'easyapply', label: 'Easy Apply', hint: 'LinkedIn Easy Apply, last 24h' },
  { id: 'custom', label: 'Custom', hint: 'Type your own instruction' },
];

const api = (p, opts) => fetch(p, opts).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j; });
const fmtDay = d => { const [y, m, dd] = d.split('-'); return new Date(Number(y), Number(m) - 1, Number(dd)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
const fmtTime = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtDur = ms => ms == null ? '' : ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;

export default function App() {
  const [summary, setSummary] = useState(null);
  const [sends, setSends] = useState([]);
  const [pending, setPending] = useState([]);
  const [runs, setRuns] = useState([]);
  const [current, setCurrent] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [kind, setKind] = useState('c2c');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState('run');
  const logRef = useRef(null);

  const refreshData = async () => {
    const [s, se, p, r] = await Promise.all([api('/api/summary'), api('/api/sends?limit=400'), api('/api/pending'), api('/api/runs')]);
    setSummary(s); setSends(se); setPending(p); setRuns(r);
  };

  useEffect(() => { refreshData().catch(e => setError(e.message)); }, []);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = m => {
      const ev = JSON.parse(m.data);
      if (ev.type === 'hello') { if (ev.current) { setCurrent(ev.current); setSelectedRun(ev.current.id); api(`/api/runs/${ev.current.id}`).then(r => setEvents(r.events)); } }
      else if (ev.type === 'run') {
        if (ev.run.status === 'running') { setCurrent(ev.run); setSelectedRun(ev.run.id); setEvents([]); }
        else { setCurrent(null); refreshData().catch(() => {}); }
        setRuns(rs => { const i = rs.findIndex(x => x.id === ev.run.id); if (i < 0) return [ev.run, ...rs]; const c = rs.slice(); c[i] = ev.run; return c; });
      }
      else if (ev.type === 'event') { setEvents(evs => (selectedRunRef.current === ev.runId ? [...evs, ev.ev] : evs)); }
    };
    return () => es.close();
  }, []);
  const selectedRunRef = useRef(null);
  useEffect(() => { selectedRunRef.current = selectedRun; }, [selectedRun]);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [events]);

  const start = async () => {
    setError('');
    try { await api('/api/sweep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, prompt: custom }) }); setTab('run'); }
    catch (e) { setError(e.message); }
  };
  const stop = async () => { if (current) await api(`/api/sweep/${current.id}/stop`, { method: 'POST' }).catch(e => setError(e.message)); };
  const openRun = async id => { setSelectedRun(id); const r = await api(`/api/runs/${id}`); setEvents(r.events); setTab('run'); };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? sends.filter(r => [r.company, r.role, r.loc, r.resume, r.kind, r.contact].join(' ').toLowerCase().includes(q)) : sends;
  }, [sends, filter]);
  const maxDay = Math.max(1, ...(summary?.days || []).map(d => d.sent + d.applied));
  const resultEv = events.find(e => e.kind === 'result');

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Outreach Console</h1>
          <p className="muted">C2C pipeline · counter at #{summary?.counter ?? '—'} · {summary ? `refreshed ${fmtTime(summary.generatedAt)}` : 'loading'}</p>
        </div>
        <div className="launch">
          <div className="kinds">
            {KINDS.map(k => (
              <button key={k.id} className={'kind' + (kind === k.id ? ' on' : '')} onClick={() => setKind(k.id)} disabled={!!current} title={k.hint}>{k.label}</button>
            ))}
          </div>
          {kind === 'custom' && <textarea value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. send my full stack resume to pat@strgyz.com, or sweep React Native remote only" rows={2} disabled={!!current} />}
          {current
            ? <button className="primary stop" onClick={stop}>Stop {KINDS.find(k => k.id === current.kind)?.label}</button>
            : <button className="primary" onClick={start} disabled={kind === 'custom' && !custom.trim()}>Run {KINDS.find(k => k.id === kind)?.label}</button>}
          <p className="muted small">{current ? `Running since ${fmtTime(current.startedAt)} · opens tabs in your Chrome` : KINDS.find(k => k.id === kind)?.hint}</p>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="tiles">
        <Tile k="Sent today" v={summary?.today} s="recruiter emails" />
        <Tile k="Last 7 days" v={summary?.week} s="recruiter emails" />
        <Tile k="Total sent" v={summary?.totalSent} s="since Oct 14" />
        <Tile k="Applications" v={summary?.applied} s="ATS + Easy Apply" />
        <Tile k="Waiting on you" v={summary?.pending} s="replies to answer" warn />
      </section>

      <nav className="tabs">
        {[['run', current ? 'Live run' : 'Runs'], ['pending', `Waiting on you (${pending.length})`], ['sends', `Sends (${sends.length})`], ['chart', 'Per day']].map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === 'run' && (
        <section className="split">
          <aside className="runs">
            <h2>Runs</h2>
            {runs.length === 0 && <p className="muted small">No runs yet. Pick a sweep above and press Run.</p>}
            {runs.map(r => (
              <button key={r.id} className={'runrow' + (selectedRun === r.id ? ' on' : '')} onClick={() => openRun(r.id)}>
                <span className={'dot ' + r.status} />
                <span className="runlabel">{KINDS.find(k => k.id === r.kind)?.label || r.kind}</span>
                <span className="muted small">{fmtTime(r.startedAt)}{r.endedAt ? ` · ${fmtDur(new Date(r.endedAt) - new Date(r.startedAt))}` : ''}</span>
              </button>
            ))}
          </aside>
          <div className="log" ref={logRef}>
            {selectedRun == null && <p className="muted">Select a run to see what it did.</p>}
            {events.map((e, i) => <Event key={i} e={e} />)}
            {current && selectedRun === current.id && <p className="muted small pulse">working…</p>}
            {resultEv && !current && <div className="resultbox"><strong>{resultEv.isError ? 'Ended with an error' : 'Finished'}</strong> · {resultEv.turns} turns · {fmtDur(resultEv.durationMs)}{resultEv.costUSD != null ? ` · $${resultEv.costUSD.toFixed(2)}` : ''}{resultEv.denials?.length ? ` · denied tools: ${[...new Set(resultEv.denials)].join(', ')}` : ''}</div>}
          </div>
        </section>
      )}

      {tab === 'pending' && (
        <section className="card">
          <h2>Replies waiting on you</h2>
          <p className="muted small">Recruiters asked for something only you can give: location, rate, visa copy, employer details, ID documents.</p>
          <div className="tablebox"><table>
            <thead><tr><th>Date</th><th>Who</th><th className="hide">Role</th><th>What they asked</th></tr></thead>
            <tbody>{pending.map((p, i) => <tr key={i}><td>{fmtDay(p.date)}</td><td>{p.company}<div className="muted small">{p.contact}</div></td><td className="hide">{p.role}</td><td>{p.note}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}

      {tab === 'sends' && (
        <section className="card">
          <div className="row"><h2>Sends and applications</h2><input type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by company, role, location, resume" /></div>
          <div className="tablebox"><table>
            <thead><tr><th>Date</th><th className="hide">#</th><th>Kind</th><th>Company</th><th>Role</th><th className="hide">Location</th><th className="hide">Resume</th></tr></thead>
            <tbody>{filtered.slice(0, 300).map((r, i) => (
              <tr key={i}><td>{fmtDay(r.date)}</td><td className="hide num">{r.n ?? ''}</td><td><span className={'pill ' + r.kind}>{r.kind}</span></td><td>{r.company}</td><td>{r.role}</td><td className="hide">{r.loc}</td><td className="hide">{r.resume}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {tab === 'chart' && summary && (
        <section className="card">
          <h2>Emails and applications per day</h2>
          <p className="muted small">Last 21 days. Solid bars are emails sent, light bars are applications.</p>
          <div className="bars">
            {summary.days.map(d => (
              <div key={d.date} className="barcol" title={`${fmtDay(d.date)}: ${d.sent} emails, ${d.applied} applications`}>
                <div className="barstack" style={{ height: `${((d.sent + d.applied) / maxDay) * 100}%` }}>
                  <div className="bar applied" style={{ flex: d.applied }} />
                  <div className="bar sent" style={{ flex: d.sent }} />
                </div>
                <span className="barlabel">{fmtDay(d.date).replace(/^\w+ /, '')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Tile({ k, v, s, warn }) {
  return <div className="tile"><span className="k">{k}</span><span className={'v' + (warn && v ? ' warn' : '')}>{v ?? '—'}</span><span className="s">{s}</span></div>;
}

function Event({ e }) {
  if (e.kind === 'text') return <p className="ev text">{e.text}</p>;
  if (e.kind === 'tool') return <p className="ev tool"><span className="toolname">{e.name.replace('mcp__claude-in-chrome__', 'chrome:')}</span> {e.input}</p>;
  if (e.kind === 'result') return <p className="ev result">{e.text}</p>;
  if (e.kind === 'stderr') return <p className="ev err">{e.text}</p>;
  return <p className="ev raw">{e.text}</p>;
}
