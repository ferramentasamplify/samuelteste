import fs from 'node:fs';
import path from 'node:path';
const root = process.env.SNIPER_CREATOR_DAILY_ROOT || '/root/.openclaw/workspaces/retencao-gabriel/work/tiktok-shop-reports/creator-daily-ledger/raw';
let cache;
export function revenueDays(days) {
  let count = 0, zeros = 0, previous = null, started = false, missing = false;
  for (const { day, value } of days) {
    if (previous && Date.parse(day) - Date.parse(previous) !== 86400000) { zeros = 0; if (started) missing = true; }
    previous = day;
    if (value == null) { zeros = 0; if (started) missing = true; continue; }
    if (!started && value > 0) started = true;
    if (!started) continue;
    count++;
    zeros = value === 0 ? zeros + 1 : 0;
    if (zeros === 3) return { days: count - 3, status: 'paused', partial: missing, stoppedAt: new Date(Date.parse(day) - 2 * 86400000).toISOString().slice(0, 10) };
  }
  return { days: started ? count : null, status: started ? 'active' : 'unavailable', partial: missing };
}
const money = value => typeof value === 'number' ? value : Number(String(value).replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.'));
export function loadRevenueDays() {
  try {
    const files = fs.readdirSync(root).sort().flatMap(month => fs.readdirSync(path.join(root, month)).filter(name => /^creator_day__.*\.json$/.test(name)).sort().map(name => path.join(root, month, name)));
    const signature = files.map(file => `${file}:${fs.statSync(file).mtimeMs}`).join('|');
    if (cache?.signature === signature) return cache.result;
    const days = files.map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
    const authors = new Map();
    for (const day of days) for (const row of day.items || []) if (!authors.has(String(row.author_id))) authors.set(String(row.author_id), []);
    for (const day of days) {
      const rows = new Map((day.items || []).map(row => [String(row.author_id), row]));
      for (const [id, history] of authors) {
        const raw = rows.get(id)?.pre_estimated_commission;
        const value = day.complete === true && raw != null && String(raw).trim() !== '' ? money(raw) : null;
        history.push({ day: day.day, value: Number.isFinite(value) ? value : null });
      }
    }
    const dailyGmv = new Map([...authors.keys()].map(id => [id, []]));
    for (const day of days) {
      const rows = new Map((day.items || []).map(row => [String(row.author_id), row]));
      for (const [id, series] of dailyGmv) {
        const raw = rows.get(id)?.sum_cl_pay_amt;
        const value = day.complete === true && raw != null && String(raw).trim() !== '' ? money(raw) : null;
        series.push({ day: day.day, gmv: Number.isFinite(value) ? value : null });
      }
    }
    const result = new Map([...authors].map(([id, history]) => [id, { ...revenueDays(history), dailyGmv: dailyGmv.get(id), dailyRevenue: history.map(point => ({ day: point.day, revenue: point.value == null ? null : point.value * .1 })) }]));
    cache = { signature, result };
    return result;
  } catch { return new Map(); }
}
