import { leadNumbers, tableTotals, returnSortColumns, sortReturnLeads, isNonAgenciado, assumesZeroReturn } from './management-totals.mjs';
import { useState } from 'react';
import CommissionActivation from './CommissionActivation';
import RemunerationSummary from './RemunerationSummary';
import ReturnProjection from './ReturnProjection';
import { fixedSalary } from './remuneration.mjs';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { managementCsv } from './commission-csv.mjs';
import { filterManagementLeads, managementCategories } from './management-filters.mjs';

const money = value => value == null ? 'A definir' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const roles = { scheduled: 'Reuniões validadas', agency: 'Agendados e agenciados', closer: 'Agenciamentos · Closer' };
const amount = part => part.inactive ? 'Comissões inativas' : money(part.commission);
const signColor = value => value == null || value === 0 ? '' : value > 0 ? 'return-positive' : 'return-negative';
const daysColor = value => value == null || value === 20 ? '' : value > 20 ? 'return-positive' : 'return-negative';

function DailyCreatorGmv({ row, label }) {
  const [open, setOpen] = useState(false);
  const history = row?.status === 'matched' ? row.revenueDays?.dailyGmv || [] : [];
  // The daily source has no confirmed affiliation date. Start at the first
  // observed value (including zero), never at the global archive start.
  const firstAvailable = history.findIndex(point => point.gmv != null);
  const series = firstAvailable < 0 ? [] : history.slice(firstAvailable);
  const dateLabel = day => day?.split('-').reverse().join('/');
  return <details className="management-commission-breakdown" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary aria-label={`Detalhar GMV diário de ${label}`}><strong>{row?.status === 'matched' ? money(row.lifetimeGmv) : 'Indisponível'}</strong><span className="management-detail-toggle">Ver faturamento diário ⌄</span></summary>
    {open && <div className="management-daily-chart"><h4>GMV diário · {label}</h4><p>Vendas do criador (GMV), não receita da Amplify nem pagamento confirmado.</p>
      {series.some(point => point.gmv != null) ? <><ResponsiveContainer width="100%" height={240}><LineChart data={series} margin={{ top: 12, right: 15, bottom: 10, left: 10 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tickFormatter={day => dateLabel(day).slice(0, 5)} minTickGap={35} /><YAxis width={65} tickFormatter={value => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(value)} /><Tooltip labelFormatter={dateLabel} formatter={value => [money(value), 'GMV diário']} /><Line type="linear" dataKey="gmv" stroke="#0047ff" strokeWidth={2} dot={false} connectNulls={false} /></LineChart></ResponsiveContainer><small>{dateLabel(series[0]?.day)} a {dateLabel(series.at(-1)?.day)} · Histórico disponível. Lacunas e dias incompletos não são tratados como zero.</small></> : <p>Histórico diário indisponível para este criador.</p>}
    </div>}
  </details>;
}

function LeadRoleCommission({ lead, role, member }) {
  const entries = lead.commissions
    .filter(item => member === 'all' || item.person.id === member)
    .flatMap(item => item.parts.filter(part => role === 'closer' ? part.role === 'closer' : ['scheduled', 'agency'].includes(part.role))
      .map(part => ({ ...part, person: item.person, included: item.included })));
  return <div className="management-role-commission">{entries.length ? entries.map(part => <small key={`${part.person.id}-${part.role}`}>
    <strong>{!part.included ? money(0) : amount(part)}</strong>
    {part.person.name} · {roles[part.role]}
    {part.rate != null && <> · {new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(part.rate)} da receita-base</>}
    {!part.included && ' · Fora da comissão'}
  </small>) : <small>Sem parcela neste mês/filtro</small>}</div>;
}

export default function CommissionManagement({ report, month, onMonth, onLogout, onReport, teamGoals }) {
  const [search, setSearch] = useState('');
  const [member, setMember] = useState('all');
  const [category, setCategory] = useState('all');
  const [selection, setSelection] = useState('all');
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' });
  const [editing, setEditing] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function saveMeta(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/commissions/meta-selection', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month: report.month, leadId: editing.id, included: !editing.metaIncluded, reason }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');
      onReport(result); setEditing(null); setReason('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const leads = sortReturnLeads(filterManagementLeads(report.leads, { search, member, category, selection, sort }), report.creatorReturns, member, sort);
  const totals = tableTotals(leads.map(lead => leadNumbers(lead, report.creatorReturns, member)));
  const fixed = report.members.some(item => fixedSalary(item.person) == null) ? null : report.members.reduce((sum, item) => sum + fixedSalary(item.person), 0);
  const commissions = report.members.some(item => item.total == null) ? null : report.members.reduce((sum, item) => sum + item.total, 0);
  const pay = commissions == null || fixed == null ? null : fixed + commissions;
  const revenue = report.creatorReturns?.team?.lifetimeRevenue;
  const margin = revenue == null || pay == null ? null : revenue - pay;
  function returnColumns(lead) {
    const row = report.creatorReturns?.creators?.find(item => item.leadId === lead.id);
    const available = row?.status === 'matched';
    const parts = lead.commissions.filter(item => item.included && (member === 'all' || item.person.id === member)).flatMap(item => item.parts);
    const cost = parts.some(part => part.commission == null || part.inactive) ? null : parts.reduce((sum, part) => sum + part.commission, 0);
    const balance = leadNumbers(lead, report.creatorReturns, member)[4];
    const duration = available ? row.revenueDays : null;
    return <>{['lifetimeGmv', 'lifetimeRevenue'].map(field => <td key={field}>{field === "lifetimeGmv" ? isNonAgenciado(lead) || assumesZeroReturn(row) ? <span title="Zero considerado na análise de retorno">{money(0)}{assumesZeroReturn(row) && <small>Sem vendas localizadas · zero assumido</small>}</span> : <DailyCreatorGmv row={row} label={lead.label} /> : available && row[field] != null ? money(row[field]) : <span title="Sem valor disponível; zero apenas na exibição">{money(0)}</span>}</td>)}<td><details className="management-commission-breakdown"><summary aria-label={`Detalhar comissão de ${lead.label}`}><strong>{cost == null ? "A definir" : money(cost)}</strong><span className="management-detail-toggle">Ver detalhamento ⌄</span></summary><div className="management-commission-content"><p>Comissão estimada · Receita-base: {money(lead.gmv * .01)} (1% do GMV)</p><h4>SDR</h4><LeadRoleCommission lead={lead} role="sdr" member={member} /><h4>Closer</h4><LeadRoleCommission lead={lead} role="closer" member={member} /><small>Valores calculados, não pagamentos confirmados.</small></div></details></td><td className={signColor(balance)}>{balance == null ? <span title="Sem dados suficientes para calcular a diferença">{money(0)}</span> : money(balance)}</td><td className={daysColor(duration?.days)}>{duration?.days == null ? <span title="Sem contagem disponível">0 dias</span> : <>{duration.days} dias<small>{duration.status === 'paused' ? 'Pausa: 3 dias zerados' : 'Em acompanhamento'}{duration.partial ? ' · histórico parcial' : ''}</small></>}</td></>;

  }
  function toggleSort(key) { setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' })); }
  const arrow = key => sort.key === key ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ' ↕';
  function download() {
    const exported = leads.map(lead => ({ ...lead, commissions: lead.commissions.filter(item => member === 'all' || item.person.id === member) }));
    const url = URL.createObjectURL(new Blob([managementCsv(report, exported, roles)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `comissoes-gestao-${report.month}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="commission-shell">
    <header className="commission-header"><div><span className="commission-overline">AMPLIFY · AQUISIÇÃO</span><h1>Comissões <span>/ Gestão</span></h1><p>Bruno e Keize · Consulta dos valores e leads considerados</p></div><div className="commission-header-actions"><label>Mês de referência<select value={month} onChange={event => { onMonth(event.target.value); setSearch(''); }}>{[...new Set([month, ...report.months])].sort().reverse().map(value => <option key={value}>{value}</option>)}</select></label><button className="commission-quiet" onClick={onLogout}>Sair ↗</button></div></header>
    {report.fixedSalariesStale && <p className="commission-notice">Aba Fixos indisponível. Exibindo a última leitura válida, quando disponível; salários sem correspondência ficam a definir.</p>}
    <section className="management-return-summary management-main-summary" aria-label="Visão geral financeira">
      {[['GMV agenciado', report.team.agency.gmv], ['Receita Amplify', revenue], ['Remuneração total', pay], ['Margem', margin]].map(([label, value]) => <article key={label} className="management-summary-card"><span>{label}</span><strong className={label === 'Margem' ? signColor(value) : ''}>{money(value)}</strong>{label === 'Remuneração total' && <small>Fixo: {money(fixed)} · Comissão: {money(commissions)}</small>}</article>)}
    </section>
    <p className="commission-rounding">Receita acumulada no histórico disponível. Remuneração: fixo mensal + comissões estimadas do mês selecionado; não comprova pagamento. Margem = receita − remuneração total. Salários fixos contabilizados uma única vez, sem rateio por lead.</p>
    <ReturnProjection data={report.creatorReturns} month={report.month} remuneration={pay} />
    {teamGoals}
    <CommissionActivation team={report.team} />
    <div className="commission-goals">{report.members.map(item => <section key={item.person.id} className="commission-section"><h2>{item.person.name}</h2><RemunerationSummary person={item.person} commission={item.total} />{Object.entries(item.totals).map(([role, data]) => <div key={role} className="management-part"><strong>{roles[role]}</strong><span>{amount(data)}</span><small>{data.count} leads · GMV: {money(data.gmv)}</small></div>)}</section>)}</div>
    <section className="commission-section"><div className="commission-section-title"><h2>Detalhamento da comissão</h2><button className="commission-quiet" disabled={!leads.length} onClick={download}>Exportar CSV</button></div>
      <p className="commission-rounding">Retorno: Creator Daily até {report.creatorReturns?.lastDay?.split('-').reverse().join('/') || 'data indisponível'}. Receita Amplify estimada = comissão do criador × 10%. Acumulado de todo o histórico disponível, não apenas após a entrada. Mês pode ser parcial; valores não são recebimentos confirmados. Margem por lead = receita acumulada menos comissão comercial do mês e filtro selecionados, antes do fixo; os resumos descontam também o fixo mensal uma única vez; não é lucro líquido nem comprovação de pagamento. Dias: desde a primeira comissão positiva no histórico disponível; três dias seguidos com comissão zero encerram a contagem no primeiro dia zerado. Lacunas não são zero. Pausa não confirma desvínculo, e o histórico pode anteceder a entrada.</p><p className="commission-notice">Desconsiderar da meta retira o GMV do realizado e o lead das comissões de Bruno e Keize, recalculando o atingimento e as faixas. A meta mensal prevista não muda. O Notion não é alterado.</p>
      {editing && <form className="management-meta-form" onSubmit={saveMeta}><strong>{editing.metaIncluded ? 'Desconsiderar' : 'Reincluir'} {editing.label} na meta de {report.month}</strong>{editing.metaIncluded ? <label>Motivo obrigatório<textarea required maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label> : <p>O lead volta ao realizado da equipe. Marcações individuais anteriores são preservadas.</p>}{error && <p role="alert" className="commission-error">{error}</p>}<button className="commission-quiet" disabled={busy || (editing.metaIncluded && !reason.trim())}>{busy ? 'Salvando…' : editing.metaIncluded ? 'Desconsiderar e recalcular' : 'Reincluir e recalcular'}</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button></form>}
      <div className="commission-list-controls"><label className="commission-search"><span className="sr-only">Buscar lead, status, SDR ou Closer</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar lead, status, SDR ou Closer…" /></label><label className="commission-selection-filter">Comissionado<select value={member} onChange={event => setMember(event.target.value)}><option value="all">Bruno e Keize</option>{report.members.map(item => <option key={item.person.id} value={item.person.id}>{item.person.name}</option>)}</select></label></div>
      <div className="commission-list-controls"><div className="commission-category-filters" role="group" aria-label="Origem da comissão">{managementCategories.map(([key, label]) => <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)}>{label}<span>{filterManagementLeads(report.leads, { member, category: key }).length}</span></button>)}</div><label className="commission-selection-filter">Mostrar<select aria-label="Mostrar" value={selection} onChange={event => setSelection(event.target.value)}><option value="all">Todos os leads</option><option value="included">Incluídos na comissão</option><option value="excluded">Desmarcados</option></select></label></div>
      <div className="commission-sort-controls"><label>Ordenar por<select aria-label="Ordenar por" value={sort.key} onChange={event => setSort(current => ({ ...current, key: event.target.value }))}>{[['label', 'Criador'], ['status', 'Status'], ['date', 'Data de alteração'], ['gmv', 'GMV entrante'], ['commission', 'Comissão'], ['sdr', 'SDR'], ['closer', 'Closer'], ...returnSortColumns].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button type="button" onClick={() => setSort(current => ({ ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' }))}>{sort.direction === 'asc' ? '↑ Crescente' : '↓ Decrescente'}</button></div>
      <p className="commission-rounding">{leads.length} de {report.leads.length} leads. Comissões estimadas discriminadas por SDR (reuniões e agenciamentos) e closer, com beneficiário e percentual sobre a receita-base de 1% do GMV. Não representam pagamentos confirmados. Responsáveis conforme o cadastro atual. Quando o papel não está identificado na base, exibimos “Não identificado”. Leads desmarcados não entram na comissão.</p>

      <div className="management-table-scroll" tabIndex={0} role="region" aria-label="Leads considerados para as comissões"><table className="management-table"><thead><tr className="management-top-totals"><th scope="row" colSpan={6}>Total · linhas filtradas<small>Margem antes do fixo mensal</small></th>{totals.map((total, index) => <td key={index} className={index === 4 ? signColor(total.value) : undefined}><strong>{index === 5 ? "—" : money(total.value ?? 0)}</strong>{index !== 5 && total.partial && <small>Parcial</small>}</td>)}</tr><tr><th scope="col" className="management-selection-column">Meta</th>{[['label', 'Perfil'], ['status', 'Status'], ['date', 'Data de alteração'], ['sdr', 'SDR'], ['closer', 'Closer'], ['gmv', 'GMV entrante']].map(([key, label]) => <th key={key} aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => toggleSort(key)}>{label}{arrow(key)}</button></th>)}{returnSortColumns.map(([key, label]) => <th key={key} aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => toggleSort(key)}>{label}{arrow(key)}</button></th>)}</tr></thead><tbody>{leads.map(lead => <tr key={lead.id}><td><label className="management-meta-check" title={lead.metaIncluded === false ? `Fora da meta: ${lead.exclusionReason || ""}` : "Considerar na meta"}><input type="checkbox" checked={lead.metaIncluded !== false} disabled={busy} aria-label={`Considerar ${lead.label} na meta`} onChange={() => { setEditing(lead); setReason(''); setError(''); }} /><span className="sr-only">Considerar na meta</span></label></td><td className="management-profile-cell"><strong>{lead.label}</strong></td><td className="management-status-cell">{lead.status}</td><td>{lead.date.split('-').reverse().join('/')}</td><td>{lead.sdr}</td><td>{lead.closer}</td><td>{money(lead.gmv)}</td>{returnColumns(lead)}</tr>)}</tbody></table></div>
      <p className="commission-rounding">Totais somam os valores conhecidos das linhas filtradas. Sem dados, exibimos zero; “Parcial” indica ausência de dados, não receita confirmada igual a zero. Dias por criador não são somados. GMV gerado e Receita Amplify são acumulados.</p>
      {!leads.length && <p className="commission-empty">Nenhum lead encontrado neste período com os filtros atuais.</p>}
    </section><footer className="commission-footer">Gestão de comissões e exclusões da meta · Dados atualizados em {new Date(report.generatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</footer>
  </main>;
}
