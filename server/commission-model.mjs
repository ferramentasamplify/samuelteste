export const KEIZE = '3fbd872b-594c-8131-bdb6-0002ac827818';
export const BRUNO = '307d872b-594c-81e9-9f48-0002dc826c24';
export const INITIAL_RULES = [
  { min: .5, closer: .03, scheduled: .028, agency: 0 },
  { min: .7, closer: .05, scheduled: .03, agency: 0 },
  { min: 1, closer: .10, scheduled: .032, agency: .02 },
  { min: 1.2, closer: .15, scheduled: .034, agency: .03 },
  { min: 1.5, closer: .20, scheduled: .036, agency: .04 },
];
const AGENCY = ['AGENCIADO', 'Convite Aceito'];
const REALIZED = ['Reunião Realizada', 'Enviar Convite', 'Convite Enviado', ...AGENCY];
const SCHEDULED = ['Qualificação', 'Reunião Agendada', 'Analise de perfil agendada', 'Primeira meet', ...REALIZED];
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const bucket = rows => ({ count: rows.length, gmv: round(rows.reduce((s, x) => s + (Number(x.gmv) || 0), 0)) });
const band = (ratio, rules) => ratio === null ? null : rules.filter(r => r.min <= ratio + 1e-10).at(-1) || null;
// Bruno authorized on 2026-11-05: October meetings, November closures.
// Meeting portion in October; agency portion and closer in November.
// Source dates and target values stay unchanged; scheduled actual follows October.
const octoberSdr = new Set(['407b0bbe-f153-8182-b2c2-feb4a1564dd6', '408b0bbe-f153-814e-b9af-d1bc976d80d1', '3b9b0bbe-f153-8179-9e6d-c4be413bd6f0']);

export function commissionReport(dataset, month, account, rules = INITIAL_RULES, selectedPerson = '', selections = {}) {
  if (account === 'gestao') {
    const reports = ['brunozardo', 'keizepassos'].map(member => commissionReport(dataset, month, member, rules, '', selections));
    const rows = new Map();
    for (const report of reports) for (const lead of report.leads) {
      if (!rows.has(lead.id)) {
        const source = dataset.creators.find(item => item.id === lead.id);
        const ids = source.responsibleIds || [];
        const name = id => id === KEIZE ? 'Keize Passos' : dataset.responsibles.find(person => person.id === id)?.name || 'Não identificado';
        rows.set(lead.id, { id: lead.id, label: lead.label, status: lead.status, date: lead.date, gmv: lead.gmv,
          sdr: ids.includes(KEIZE) ? name(KEIZE) : 'Não identificado',
          closer: ids.includes(BRUNO) ? name(BRUNO) : AGENCY.includes(source.status) && ids.includes(KEIZE) && ids.length === 1 ? name(KEIZE) : 'Não identificado',
          responsibles: ids.map(name), metaIncluded: selections[`${month}:team:${lead.id}`]?.included !== false, exclusionReason: selections[`${month}:team:${lead.id}`]?.reason || '', commissions: [] });
        rows.get(lead.id).soleResponsibleRole = ids.length === 1 ? ids[0] === KEIZE ? 'sdr' : ids[0] === BRUNO ? 'closer' : null : null;
      }
      rows.get(lead.id).commissions.push({ person: report.person, included: lead.included, parts: lead.parts });
    }
    return { management: true, team: reports[0].team, month, months: reports[0].months, generatedAt: dataset.generatedAt, members: reports.map(({ person, total, totals }) => ({ person, total, totals })), leads: [...rows.values()].sort((a,b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label)) };
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
  const [year, m] = month.split('-').map(Number);
  const start = month === '2026-10' ? '2026-10-08' : `${month}-01`;
  const end = `${month}-${new Date(Date.UTC(year, m, 0)).getUTCDate()}`;
  const eligible = dataset.creators.filter(x => x.editedDate >= start && x.editedDate <= end);
  const metaIncluded = lead => selections[`${month}:team:${lead.id}`]?.included !== false;
  const stages = { scheduled: SCHEDULED, agency: AGENCY };
  const goals = (dataset.goals?.daily || []).filter(x => x.date.startsWith(month) && x.metric === 'gmv');
  const team = Object.fromEntries(Object.entries(stages).map(([key, statuses]) => {
    const stage = key === 'scheduled' ? 'Reuniões agendadas' : 'Agenciado';
    const goal = round(goals.filter(x => x.stage === stage).reduce((s, x) => s + (Number(x.normalDaily) || 0), 0));
    const stageEligible = key === 'scheduled' ? dataset.creators.filter(x => octoberSdr.has(x.id) ? month === '2026-10' : x.editedDate >= start && x.editedDate <= end) : eligible;
    const actual = bucket(stageEligible.filter(x => metaIncluded(x) && statuses.includes(x.status)));
    const ratio = goal > 0 && dataset.goals?.status === 'ok' ? actual.gmv / goal : null;
    return [key, { ...actual, goal, ratio, band: band(ratio, rules) }];
  }));
  const people = dataset.responsibles.filter(p => ![KEIZE, BRUNO].includes(p.id)).map(p => ({ id: p.id, name: p.name }));
  const personId = account === 'keizepassos' ? KEIZE : account === 'brunozardo' ? BRUNO : (people.find(p => p.id === selectedPerson)?.id || people[0]?.id);
  const person = dataset.responsibles.find(p => p.id === personId);
  const included = lead => metaIncluded(lead) && selections[`${month}:${personId}:${lead.id}`]?.included !== false;
  const knownRole = [KEIZE, BRUNO].includes(personId);
  const roles = personId === KEIZE ? ['scheduled', 'agency', 'closer'] : ['closer'];
  const inactiveFor = role => knownRole && team[role === 'scheduled' ? 'scheduled' : 'agency'].ratio !== null && team[role === 'scheduled' ? 'scheduled' : 'agency'].ratio < .5;
  const rateFor = role => inactiveFor(role) ? 0 : role === 'scheduled' ? team.scheduled.band?.scheduled : role === 'agency' ? team.agency.band?.agency : team.agency.band?.closer;
  const matches = (lead, role) => {
    const competence = personId === KEIZE && role === 'scheduled' && octoberSdr.has(lead.id) ? '2026-10' : null;
    if (competence ? month !== competence : !(lead.editedDate >= start && lead.editedDate <= end)) return false;
    if (role === 'agency') return AGENCY.includes(lead.status);
    if (!lead.responsibleIds?.includes(personId)) return false;
    return role === 'scheduled' ? REALIZED.includes(lead.status) : AGENCY.includes(lead.status) && (personId !== KEIZE || lead.responsibleIds.length === 1);
  };
  const totals = Object.fromEntries(roles.map(role => {
    const rows = dataset.creators.filter(x => included(x) && matches(x, role));
    const stats = bucket(rows);
    const rate = knownRole ? rateFor(role) ?? null : null;
    return [role, { ...stats, inactive: inactiveFor(role), revenue: round(stats.gmv * .01), rate, commission: rate === null ? null : round(stats.gmv * .01 * rate) }];
  }));
  const leads = dataset.creators.filter(x => roles.some(role => matches(x, role))).map(x => {
    const parts = roles.filter(role => matches(x, role)).map(role => {
      const rate = knownRole ? rateFor(role) ?? null : null;
      return { role, inactive: inactiveFor(role), rate, commission: rate === null ? null : round((Number(x.gmv) || 0) * .01 * rate) };
    });
    const category = parts.some(p => p.role === 'closer') ? 'closer' : parts.some(p => p.role === 'agency') ? 'agency' : 'scheduled';
    return { id: x.id, label: x.creatorId || `Lead ${x.id.slice(0, 8)}`, status: x.status, date: x.editedDate, gmv: Number(x.gmv) || 0, revenue: round((Number(x.gmv) || 0) * .01), parts, category, included: included(x) };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.gmv - a.gmv);
  const values = Object.values(totals);
  const months = [...new Set([dataset.today?.slice(0, 7), ...dataset.creators.map(x => x.editedDate?.slice(0, 7)), ...(dataset.goals?.daily || []).map(x => x.date.slice(0, 7))].filter(Boolean))].sort().reverse();
  return { month, months, start, end, generatedAt: dataset.generatedAt, person: { id: personId, name: personId === KEIZE ? 'Keize Passos' : person?.name || 'Membro' }, people: account === 'outro' ? people : [], knownRole, team, totals, total: values.some(x => x.commission === null) ? null : round(values.reduce((s, x) => s + x.commission, 0)), leads, excludedCount: leads.filter(x => !x.included).length, rules };
}
