import fs from 'node:fs';
import path from 'node:path';
import { loadRevenueDays } from './revenue-days.mjs';

const root = process.env.SNIPER_CREATOR_MONTHLY_ROOT || '/root/.openclaw/workspaces/retencao-gabriel/work/tiktok-shop-reports/creator-daily-ledger/monthly';
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const normalize = value => String(value || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
let cache;

// Only the management API calls this loader. Never copy source data to public/.
export function loadCreatorReturns() {
  try {
    const files = fs.readdirSync(root).filter(name => /^\d{4}-\d{2}$/.test(name)).sort().map(month => path.join(root, month, `creator_month_sum_from_days__${month}.json`)).filter(file => fs.existsSync(file));
    const signature = files.map(file => `${file}:${fs.statSync(file).mtimeMs}`).join('|');
    if (cache?.signature === signature) return cache.source;
    const months = files.map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
    for (const month of months) {
      if (month.schema_version !== 2 || month.aggregation !== 'sum_of_one_day_creator_reports' || !Array.isArray(month.items) || !month.coverage?.last_day) throw new Error('Invalid source');
      const ids = new Set();
      for (const row of month.items) {
        if (!row.author_id || ids.has(String(row.author_id)) || !Number.isFinite(row.sum_cl_pay_amt) || !Number.isFinite(row.pre_estimated_commission)) throw new Error('Invalid source row');
        ids.add(String(row.author_id));
      }
    }
    const source = { months };
    cache = { signature, source };
    return source;
  } catch { return { months: [], unavailable: true }; }
}

export function managementReturns(report, dataset, source) {
  const dailyRevenue = loadRevenueDays();
  const months = source.months || [];
  const authors = new Map(), aliases = new Map();
  const addAlias = (alias, id) => {
    const key = normalize(alias);
    if (!key) return;
    if (!aliases.has(key)) aliases.set(key, new Set());
    aliases.get(key).add(id);
  };
  for (const month of months) for (const row of month.items) {
    const id = String(row.author_id);
    if (!authors.has(id)) authors.set(id, { id, gmv: 0, creatorCommission: 0, monthGmv: 0, monthCommission: 0 });
    const author = authors.get(id);
    author.gmv += row.sum_cl_pay_amt;
    author.creatorCommission += row.pre_estimated_commission;
    if (month.month === report.month) { author.monthGmv += row.sum_cl_pay_amt; author.monthCommission += row.pre_estimated_commission; }
    addAlias(row.author_alias, id);
    const history = Array.isArray(row.aliases) ? row.aliases : String(row.aliases || '').split('|');
    for (const alias of history) addAlias(alias, id);
  }
  const coverage = months.find(month => month.month === report.month)?.coverage;
  const available = !source.unavailable && months.length > 0;
  const sources = new Map(dataset.creators.map(lead => [lead.id, lead]));
  const returns = [];
  for (const lead of report.leads.filter(item => ['AGENCIADO', 'Convite Aceito'].includes(item.status))) {
    const sourceLead = sources.get(lead.id);
    const key = normalize(sourceLead?.creatorId);
    const ids = authors.has(key) ? new Set([key]) : aliases.get(key);
    const author = ids?.size === 1 ? authors.get([...ids][0]) : null;
    returns.push({ leadId: lead.id, label: lead.label, status: !available ? 'unavailable' : ids?.size > 1 ? 'ambiguous' : author ? 'matched' : 'unmatched', authorId: author?.id || null,
      monthGmv: author && coverage ? round(author.monthGmv) : null,
      monthRevenue: author && coverage ? round(author.monthCommission * .1) : null,
      lifetimeGmv: author ? round(author.gmv) : null,
      lifetimeCreatorCommission: author ? round(author.creatorCommission) : null,
      lifetimeRevenue: author ? round(author.creatorCommission * .1) : null,
      revenueDays: author ? dailyRevenue.get(author.id) || null : null,
      memberIds: lead.commissions.map(item => item.person.id),
    });
  }
  function summarize(rows, cost) {
    const unique = [...new Map(rows.filter(row => row.status === 'matched').map(row => [row.authorId, row])).values()];
    const sum = field => round(unique.reduce((total, row) => total + (row[field] || 0), 0));
    const lifetimeRevenue = available ? sum('lifetimeRevenue') : null;
    return { creators: unique.length, unmatched: rows.filter(row => row.status !== 'matched').length,
      monthGmv: available && coverage ? sum('monthGmv') : null, monthRevenue: available && coverage ? sum('monthRevenue') : null,
      lifetimeGmv: available ? sum('lifetimeGmv') : null, lifetimeRevenue,
      salesCommission: cost, balance: lifetimeRevenue !== null && cost !== null ? round(lifetimeRevenue - cost) : null };
  }
  const totalCost = report.members.some(member => member.total == null) ? null : round(report.members.reduce((total, member) => total + member.total, 0));
  return { status: available ? 'available' : 'unavailable', source: 'Creator Daily · soma dos relatórios de um dia', agencyRate: .1,
    firstDay: months.map(month => month.coverage.first_day).sort()[0] || null,
    lastDay: months.map(month => month.coverage.last_day).sort().at(-1) || null,
    monthCoverage: coverage || null,
    incompleteMonths: months.filter(month => month.coverage.missing_through_last_day?.length || month.coverage.incomplete_days?.length).map(month => month.month),
    team: summarize(returns, totalCost),
    members: report.members.map(member => ({ person: member.person, ...summarize(returns.filter(row => row.memberIds.includes(member.person.id)), member.total) })),
    creators: returns,
    note: 'Coorte: agenciados listados no mês de comissão, com responsáveis atuais. Acumulado em toda a base diária disponível; não comprova receita apenas após o agenciamento. Receita Amplify estimada = comissão estimada do criador × 10%. Saldo = receita acumulada menos comissão comercial calculada do mês; não é lucro líquido nem comprovação de pagamento. Receita de criadores compartilhados aparece em cada responsável, mas só uma vez no total da equipe.' };
}
