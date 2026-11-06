import { withSalaries } from './fixed-salaries.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { commissionReport, INITIAL_RULES } from './commission-model.mjs';
import { loadCreatorReturns, managementReturns } from './creator-returns.mjs';

function withReturns(report, dataset) {
  return report.management ? { ...report, creatorReturns: managementReturns(report, dataset, loadCreatorReturns()) } : report;
}

const privateDir = path.resolve('.private');
const selectionsFile = process.env.SNIPER_SELECTION_FILE || path.join(privateDir, 'selections.json');
function selections() {
  if (!fs.existsSync(selectionsFile)) return {};
  return JSON.parse(fs.readFileSync(selectionsFile, 'utf8'));
}
const sessions = new Map();
const attempts = new Map();
const sessionMs = 8 * 60 * 60 * 1000;
let ruleCache;
let rulePromise;
const cookieName = 'sniper_commission_session';
const sheetUrl = 'https://docs.google.com/spreadsheets/d/1WRaYpUtWZP0vF695SKwWigE5UrP0ix9DBxJ4KXxfX9w/gviz/tq?tqx=out:csv&sheet=Comiss%C3%B5es';

function readRules() {
  if (!ruleCache) {
    try { ruleCache = JSON.parse(fs.readFileSync(path.join(privateDir, 'rules.json'), 'utf8')); }
    catch { ruleCache = { rows: INITIAL_RULES, fetchedAt: '2026-10-31T19:02:00Z' }; }
  }
  return ruleCache;
}
function csvRows(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(value.replace(/\r$/, '')); value = ''; if (c === '\n') { rows.push(row); row = []; } }
    else value += c;
  }
  row.push(value.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row);
  return rows;
}
async function rules() {
  const cached = readRules();
  if (Date.now() - Date.parse(cached.fetchedAt) < 300000) return cached;
  if (!rulePromise) rulePromise = (async () => {
    try {
      const res = await fetch(sheetUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('sheet');
      const csv = csvRows(await res.text());
      if (!csv[0]?.join(' ').includes('Comissão closer')) throw new Error('header');
      const pct = x => Number(String(x).replace('%', '').replace(',', '.')) / 100;
      const rows = csv.slice(1).filter(r => r[0]?.trim()).map(r => ({ min: pct(r[0]), closer: pct(r[1]), scheduled: pct(r[2]), agency: pct(r[3]) })).sort((a,b) => a.min-b.min);
      if (!rows.length || rows.some(r => Object.values(r).some(v => !Number.isFinite(v) || v < 0)) || rows.some(r => r.closer > 1 || r.scheduled > 1 || r.agency > 1)) throw new Error('values');
      ruleCache = { rows, fetchedAt: new Date().toISOString() };
      fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(privateDir, 'rules.json'), JSON.stringify(ruleCache), { mode: 0o600 });
      return ruleCache;
    } catch { return { ...cached, stale: true }; }
    finally { rulePromise = null; }
  })();
  return rulePromise;
}
const send = (res, status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.end(JSON.stringify(data)); };
async function body(req) {
  let value = '';
  for await (const part of req) { value += part; if (value.length > 4096) throw new Error('body'); }
  return JSON.parse(value || '{}');
}
function session(req) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const saved = sessions.get(token);
  if (saved && saved.expires > Date.now()) return { ...saved, token };
  if (token) sessions.delete(token);
  return null;
}
export function commissionMiddleware(req, res, next) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/.private') || url.pathname.startsWith('/server/')) return send(res, 404, { error: 'Não encontrado.' });
  if (!url.pathname.startsWith('/api/commissions')) return next();
  (async () => {
    if (req.method === 'POST' && req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (origin.host !== req.headers.host) return send(res, 403, { error: 'Origem inválida.' });
    }
    const current = session(req);
    if (url.pathname === '/api/commissions/login' && req.method === 'POST') {
      const input = await body(req);
      const account = String(input.username || '').trim().toLowerCase();
      const ip = req.socket.remoteAddress || 'unknown';
      const key = `${ip}:${account}`;
      const attempt = attempts.get(key) || { count: 0, until: Date.now() + 900000 };
      if (attempt.until < Date.now()) { attempt.count = 0; attempt.until = Date.now() + 900000; }
      if (attempt.count >= 10) return send(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });
      attempt.count++; attempts.set(key, attempt);
      const authFile = account === 'gestao' ? 'management-auth.json' : 'auth.json';
      const config = JSON.parse(fs.readFileSync(path.join(privateDir, authFile), 'utf8'));
      const hash = crypto.scryptSync(String(input.password || ''), config.salt, 64);
      if (!['keizepassos', 'brunozardo', 'outro', 'gestao'].includes(account) || !crypto.timingSafeEqual(hash, Buffer.from(config.hash, 'hex'))) return send(res, 401, { error: 'Login ou senha inválidos.' });
      attempts.delete(key);
      if (current) sessions.delete(current.token);
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { account, expires: Date.now() + sessionMs });
      res.setHeader('Set-Cookie', `${cookieName}=${token}; Path=/api/commissions; HttpOnly; SameSite=Strict; Max-Age=${sessionMs / 1000}${req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : ''}`);
      return send(res, 200, { account });
    }
    if (url.pathname === '/api/commissions/session' && req.method === 'GET') return send(res, current ? 200 : 401, current ? { account: current.account } : { error: 'Entre para consultar suas comissões.' });
    if (url.pathname === '/api/commissions/logout' && req.method === 'POST') {
      if (current) sessions.delete(current.token);
      res.setHeader('Set-Cookie', `${cookieName}=; Path=/api/commissions; HttpOnly; SameSite=Strict; Max-Age=0`);
      return send(res, 200, { ok: true });
    }
    if (!current) return send(res, 401, { error: 'Entre para consultar suas comissões.' });
    if (url.pathname === '/api/commissions/report' && req.method === 'GET') {
      const month = url.searchParams.get('month') || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return send(res, 400, { error: 'Mês inválido.' });
      const dataset = JSON.parse(fs.readFileSync(path.resolve('public/luiz-contatos.json'), 'utf8'));
      const config = await rules();
      const report = commissionReport(dataset, month, current.account, config.rows, url.searchParams.get('person') || '', selections());
      return send(res, 200, { ...await withSalaries(withReturns(report, dataset), csvRows), rulesUpdatedAt: config.fetchedAt, rulesStale: !!config.stale });
    }
    if (url.pathname === '/api/commissions/meta-selection' && req.method === 'POST') {
      if (current.account !== 'gestao') return send(res, 403, { error: 'Apenas a gestão pode desconsiderar leads da meta.' });
      const input = await body(req);
      const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month) || typeof input.included !== 'boolean' || typeof input.leadId !== 'string' || (!input.included && !reason) || reason.length > 500) return send(res, 400, { error: 'Informe um motivo de até 500 caracteres.' });
      const dataset = JSON.parse(fs.readFileSync(path.resolve('public/luiz-contatos.json'), 'utf8'));
      const config = await rules();
      const saved = selections();
      const report = commissionReport(dataset, input.month, 'gestao', config.rows, '', saved);
      if (!report.leads.some(lead => lead.id === input.leadId)) return send(res, 403, { error: 'Lead não disponível neste período.' });
      const key = `${input.month}:team:${input.leadId}`;
      const previous = saved[key];
      const event = { included: input.included, reason: input.included ? '' : reason, updatedAt: new Date().toISOString(), updatedBy: current.account };
      saved[key] = { ...event, history: [...(previous?.history || []), event] };
      fs.mkdirSync(path.dirname(selectionsFile), { recursive: true, mode: 0o700 });
      fs.writeFileSync(`${selectionsFile}.tmp`, JSON.stringify(saved), { mode: 0o600 });
      fs.renameSync(`${selectionsFile}.tmp`, selectionsFile);
      return send(res, 200, { ...await withSalaries(withReturns(commissionReport(dataset, input.month, 'gestao', config.rows, '', saved), dataset), csvRows), rulesUpdatedAt: config.fetchedAt, rulesStale: !!config.stale });
    }
    if (url.pathname === '/api/commissions/selection' && req.method === 'POST') {
      if (current.account === 'gestao') return send(res, 403, { error: 'Acesso de gestão somente para consulta.' });
      const input = await body(req);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month) || typeof input.included !== 'boolean' || typeof input.leadId !== 'string') return send(res, 400, { error: 'Seleção inválida.' });
      const dataset = JSON.parse(fs.readFileSync(path.resolve('public/luiz-contatos.json'), 'utf8'));
      const config = await rules();
      const saved = selections();
      const report = commissionReport(dataset, input.month, current.account, config.rows, String(input.person || ''), saved);
      if (!report.leads.some(x => x.id === input.leadId)) return send(res, 403, { error: 'Lead não disponível para este acesso e período.' });
      saved[`${input.month}:${report.person.id}:${input.leadId}`] = { included: input.included, updatedAt: new Date().toISOString(), updatedBy: current.account };
      fs.mkdirSync(path.dirname(selectionsFile), { recursive: true, mode: 0o700 });
      fs.writeFileSync(`${selectionsFile}.tmp`, JSON.stringify(saved), { mode: 0o600 });
      fs.renameSync(`${selectionsFile}.tmp`, selectionsFile);
      const updated = commissionReport(dataset, input.month, current.account, config.rows, report.person.id, saved);
      return send(res, 200, { ...await withSalaries(updated, csvRows), rulesUpdatedAt: config.fetchedAt, rulesStale: !!config.stale });
    }
    return send(res, 404, { error: 'Não encontrado.' });
  })().catch(() => send(res, 503, { error: 'Não foi possível carregar. Tente novamente em instantes.' }));
}
export const commissionPlugin = () => ({ name: 'sniper-commissions', configureServer(server) { server.middlewares.use(commissionMiddleware); }, configurePreviewServer(server) { server.middlewares.use(commissionMiddleware); } });
