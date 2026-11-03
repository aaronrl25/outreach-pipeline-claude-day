import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const DATA = path.join(REPO, 'data', '2026-10-14');
const RUNS = path.join(__dirname, '..', 'runs');
const HOME = os.homedir();
const PORT = Number(process.env.PORT || 8790);
const CLAUDE = process.env.CLAUDE_BIN || path.join(HOME, '.local', 'bin', 'claude');

// Tools a sweep may use without asking; everything else is denied in headless mode.
function allowedTools() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'allowed-tools.json'), 'utf8')).tools; } catch { return []; }
}

const PROMPTS = {
  c2c: 'sweep',
  inbox: 'Check the Gmail inbox and the "C2C Groups" label for the last 6 hours only (no LinkedIn search pass). Send tailored emails for any fitting C2C requirement you have not contacted, log them, and report replies that need Aaron.',
  easyapply: 'sweep easy to apply last 24 hours',
};
const DESCRIPTIONS = {
  c2c: 'C2C sweep: LinkedIn content search (8 queries, past 24h) + C2C Groups + inbox, then tailored emails.',
  inbox: 'Inbox and Google Groups check only, no LinkedIn search pass.',
  easyapply: 'LinkedIn Easy Apply sweep for the last 24 hours.',
  custom: 'Custom instruction.',
};

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------- data from the repo ----------
function readTracker() {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, 'tracker_rows.json'), 'utf8')); } catch { return []; }
}
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function readLog() {
  try { return parseCsv(fs.readFileSync(path.join(DATA, 'Outreach_Log.csv'), 'utf8')); } catch { return []; }
}
function sends() {
  const out = [];
  for (const r of readTracker()) {
    const st = String(r.status || '');
    const up = st.toUpperCase();
    const kind = up.startsWith('SENT') || up.includes('SENT #') ? 'sent' : up.includes('APPLIED') ? 'applied' : up.includes('DRAFT') ? 'draft' : null;
    if (!kind) continue;
    const d = st.match(/(2026-\d\d-\d\d)/);
    const date = d ? d[1] : (/^2026-\d\d-\d\d$/.test(String(r.posted || '')) ? r.posted : null);
    if (!date) continue;
    const n = st.match(/#(\d{3})/);
    out.push({ date, n: n ? Number(n[1]) : null, kind, company: r.company || '', role: r.role || '', loc: r.loc || '', type: r.type || '', contact: r.contact || '', resume: String(r.resume || '').replace('Aaron_Ramirez_', ''), src: r.src || '', status: st, link: r.link || '' });
  }
  out.sort((a, b) => b.date.localeCompare(a.date) || ((b.n || 0) - (a.n || 0)));
  return out;
}
function pending() {
  const out = [];
  for (const r of readLog()) {
    if (r.length < 10) continue;
    const [date, status, contact, company, role, loc, , , , note] = r;
    if (['reply', 'reply_pending', 'aaron_handling'].includes(status) && date >= '2026-10-27') out.push({ date, status, contact, company, role, loc, note });
  }
  out.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}
function localDay(d = new Date()) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }

app.get('/api/summary', (_req, res) => {
  const rows = sends();
  const today = localDay();
  const week = localDay(new Date(Date.now() - 6 * 864e5));
  const from = localDay(new Date(Date.now() - 20 * 864e5));
  const perDay = {};
  for (const r of rows) { if (r.date >= from) { perDay[r.date] ||= { date: r.date, sent: 0, applied: 0 }; perDay[r.date][r.kind === 'applied' ? 'applied' : 'sent'] += 1; } }
  const days = []; for (let i = 20; i >= 0; i--) { const k = localDay(new Date(Date.now() - i * 864e5)); days.push(perDay[k] || { date: k, sent: 0, applied: 0 }); }
  res.json({
    today: rows.filter(r => r.kind === 'sent' && r.date === today).length,
    week: rows.filter(r => r.kind === 'sent' && r.date >= week).length,
    totalSent: rows.filter(r => r.kind === 'sent').length,
    applied: rows.filter(r => r.kind === 'applied').length,
    pending: pending().length,
    counter: Math.max(0, ...rows.map(r => r.n || 0)),
    days,
    generatedAt: new Date().toISOString(),
  });
});
app.get('/api/sends', (req, res) => { const limit = Math.min(Number(req.query.limit) || 300, 2000); res.json(sends().slice(0, limit)); });
app.get('/api/pending', (_req, res) => res.json(pending()));
app.get('/api/config', (_req, res) => res.json({ prompts: PROMPTS, descriptions: DESCRIPTIONS, allowedTools: allowedTools(), claude: CLAUDE, repo: REPO }));

// ---------- sweep runs ----------
const runs = new Map();
const clients = new Set();
let current = null;
fs.mkdirSync(RUNS, { recursive: true });
try {
  for (const l of fs.readFileSync(path.join(RUNS, 'runs.jsonl'), 'utf8').split('\n')) { if (!l.trim()) continue; const r = JSON.parse(l); runs.set(r.id, { ...r, events: [] }); }
} catch {}

function broadcast(ev) { const s = `data: ${JSON.stringify(ev)}\n\n`; for (const c of clients) c.write(s); }
function persist(run) { const { events, ...meta } = run; fs.appendFileSync(path.join(RUNS, 'runs.jsonl'), JSON.stringify(meta) + '\n'); }
function pushEvent(run, ev) { run.events.push(ev); fs.appendFileSync(path.join(RUNS, run.id + '.log'), JSON.stringify(ev) + '\n'); broadcast({ type: 'event', runId: run.id, ev }); }

function shortInput(name, input) {
  if (!input) return '';
  if (name === 'Bash') return String(input.description || input.command || '').slice(0, 160);
  if (name.startsWith('mcp__claude-in-chrome__')) {
    const i = { ...input }; delete i.tabId;
    if (i.actions) return `${i.actions.length} browser actions: ${i.actions.map(a => a.name).join(', ')}`.slice(0, 160);
    if (i.url) return String(i.url).slice(0, 120);
    if (i.text) return String(i.text).slice(0, 120);
    return JSON.stringify(i).slice(0, 120);
  }
  return JSON.stringify(input).slice(0, 140);
}
function onStreamMessage(run, msg) {
  if (msg.type === 'assistant' && msg.message?.content) {
    for (const c of msg.message.content) {
      if (c.type === 'text' && c.text?.trim()) pushEvent(run, { t: Date.now(), kind: 'text', text: c.text.trim() });
      if (c.type === 'tool_use') pushEvent(run, { t: Date.now(), kind: 'tool', name: c.name, input: shortInput(c.name, c.input) });
    }
  } else if (msg.type === 'result') {
    pushEvent(run, { t: Date.now(), kind: 'result', text: String(msg.result || '').trim(), isError: !!msg.is_error, turns: msg.num_turns, durationMs: msg.duration_ms, costUSD: msg.total_cost_usd, denials: (msg.permission_denials || []).map(d => d.tool_name) });
  }
}

app.get('/api/runs', (_req, res) => res.json([...runs.values()].map(({ events, ...m }) => m).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 30)));
app.get('/api/runs/:id', (req, res) => {
  const r = runs.get(req.params.id); if (!r) return res.status(404).json({ error: 'not found' });
  let events = r.events;
  if (!events.length) { try { events = fs.readFileSync(path.join(RUNS, r.id + '.log'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch {} }
  res.json({ ...r, events });
});

app.post('/api/sweep', (req, res) => {
  if (current) return res.status(409).json({ error: 'A sweep is already running', runId: current.id });
  const kind = String(req.body?.kind || 'c2c');
  const prompt = kind === 'custom' ? String(req.body?.prompt || '').trim() : PROMPTS[kind];
  if (!prompt) return res.status(400).json({ error: 'Empty prompt' });
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const run = { id, kind, prompt, description: DESCRIPTIONS[kind], startedAt: new Date().toISOString(), status: 'running', events: [] };
  runs.set(id, run); current = run;
  broadcast({ type: 'run', run: { ...run, events: undefined } });
  // Headless Claude Code with the Chrome extension, scoped to the allowlist above; cwd is $HOME so the
  // outreach memory for this project loads. The repo is added as a working directory.
  const args = ['--chrome', '-p', prompt, '--output-format', 'stream-json', '--verbose', '--add-dir', REPO, '--allowedTools', allowedTools().join(',')];
  const env = { ...process.env }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT;
  const child = spawn(CLAUDE, args, { cwd: HOME, env, stdio: ['ignore', 'pipe', 'pipe'] });
  run.pid = child.pid;
  let buf = '';
  child.stdout.on('data', d => {
    buf += d.toString(); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
      try { onStreamMessage(run, JSON.parse(line)); } catch { pushEvent(run, { t: Date.now(), kind: 'raw', text: line.slice(0, 300) }); }
    }
  });
  child.stderr.on('data', d => pushEvent(run, { t: Date.now(), kind: 'stderr', text: d.toString().slice(0, 400) }));
  child.on('error', e => pushEvent(run, { t: Date.now(), kind: 'stderr', text: `could not start claude: ${e.message}` }));
  child.on('close', code => {
    run.status = run.status === 'stopped' ? 'stopped' : code === 0 ? 'done' : 'failed';
    run.exitCode = code; run.endedAt = new Date().toISOString(); current = null;
    persist(run); broadcast({ type: 'run', run: { ...run, events: undefined } });
  });
  res.json({ runId: id });
});
app.post('/api/sweep/:id/stop', (req, res) => {
  const r = runs.get(req.params.id); if (!r || r.status !== 'running') return res.status(404).json({ error: 'not running' });
  r.status = 'stopped'; try { process.kill(r.pid, 'SIGTERM'); } catch {}
  res.json({ ok: true });
});

app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'hello', current: current ? { ...current, events: undefined } : null })}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html'))); }
app.listen(PORT, '127.0.0.1', () => console.log(`outreach console api on http://127.0.0.1:${PORT} (repo ${REPO})`));
