import fs from 'node:fs';
import path from 'node:path';
const url = 'https://docs.google.com/spreadsheets/d/1WRaYpUtWZP0vF695SKwWigE5UrP0ix9DBxJ4KXxfX9w/gviz/tq?tqx=out:csv&sheet=Fixos';
const cacheFile = path.resolve('.private/fixed-salaries.json');
let cache, pending;
const tokens = name => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(/\s+/);
export function salaryFor(person, rows) {
  const name = tokens(person?.name);
  const matches = rows.filter(row => { const other = tokens(row.name); return name.join(' ') === other.join(' ') || name.length > 1 && other.length > 1 && name[0] === other[0] && name.at(-1) === other.at(-1); });
  return matches.length === 1 ? matches[0].fixed : null;
}
export async function withSalaries(report, parseCsv) {
  if (!cache) { try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {} }
  if (!cache || Date.now() - Date.parse(cache.fetchedAt) > 300000) {
    if (!pending) pending = (async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw Error('sheet');
        const csv = parseCsv(await response.text());
        if (csv[0]?.[0] !== 'Nome' || csv[0]?.[2] !== 'Fixo') throw Error('header');
        const rows = csv.slice(1).filter(row => row[0]?.trim()).map(row => ({ name: row[0].trim(), role: row[1], fixed: row[2]?.trim() ? Number(row[2].replace(/R\$|\s|\./g, '').replace(',', '.')) : NaN }));
        if (!rows.length || rows.some(row => !Number.isFinite(row.fixed) || row.fixed < 0)) throw Error('values');
        const next = { rows, fetchedAt: new Date().toISOString() };
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true, mode: 0o700 });
        fs.writeFileSync(cacheFile + '.tmp', JSON.stringify(next), { mode: 0o600 });
        fs.renameSync(cacheFile + '.tmp', cacheFile);
        cache = next;
      } catch { if (cache) cache = { ...cache, stale: true }; }
      finally { pending = null; }
    })();
    await pending;
  }
  const enrich = person => {
    const proportional = report.month === '2026-10' && person.id === '3fbd872b-594c-8131-bdb6-0002ac827818';
    return { ...person, fixedSalary: proportional ? 838.71 : salaryFor(person, cache?.rows || []), ...(proportional ? { fixedSalaryNote: 'Fixo proporcional · entrada em 19/10/2026' } : {}) };
  };
  return { ...report, ...(report.person ? { person: enrich(report.person) } : {}), ...(report.members ? { members: report.members.map(member => ({ ...member, person: enrich(member.person) })) } : {}), fixedSalariesStale: !cache || !!cache.stale, fixedSalariesUpdatedAt: cache?.fetchedAt || null };
}
