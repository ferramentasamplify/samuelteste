import RemunerationSummary from './RemunerationSummary';
import { remuneration } from './remuneration.mjs';
import { useEffect, useState } from 'react';
import './commissions.css';
import { commissionCsv } from './commission-csv.mjs';
import CommissionManagement from './CommissionManagement';
import CommissionActivation from './CommissionActivation';

const money = n => n === null || n === undefined ? 'A definir' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const inactiveLabel = 'Comissões inativas';
const commissionValue = (value, inactive) => inactive ? inactiveLabel : money(value);
const allInactive = parts => parts.length > 0 && parts.every(part => part.inactive);
const pct = n => n === null || n === undefined ? 'Sem faixa' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n * 100)}%`;
const date = s => s ? s.split('-').reverse().join('/') : '';
const monthLabel = s => new Date(`${s}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const names = { scheduled: 'Reuniões validadas', agency: 'Agendados e agenciados', closer: 'Agenciamentos pelo SDR' };
const hints = { scheduled: 'Reuniões com os critérios BANT aprovados.', agency: <>GMV total agenciado no mês.<br />(Esta comissão só é ativa a partir de 100% da meta de agenciamento atingida.)</>, closer: 'Reuniões em que o SDR agendou e atuou como closer.' };
const leadAmount = lead => !lead.included ? 0 : lead.parts.some(p => p.commission === null) ? null : lead.parts.reduce((sum, p) => sum + p.commission, 0);
const matchesCategory = (lead, category) => category === 'all' || (category === 'scheduled' ? lead.parts.some(part => part.role === 'scheduled') : lead.category === category);
async function api(endpoint, options = {}) {
  const res = await fetch(`/api/commissions/${endpoint}`, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Não foi possível carregar.'), { status: res.status });
  return data;
}
function Brand() { return <div className="commission-brand"><img src="/amplify-symbol.jpg" alt="" /><span>Amplify<small>AQUISIÇÃO</small></span></div>; }
function Login({ onLogin }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const fields = new FormData(event.currentTarget);
    try { const result = await api('login', { method: 'POST', body: JSON.stringify({ username: fields.get('username'), password: fields.get('password') }) }); onLogin(result.account); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="commission-shell"><div className="commission-login-layout">
    <section className="commission-intro"><Brand /><span className="commission-overline">PLANO SNIPER</span><h1>Seu resultado.<br />Sua comissão.</h1><p>Acompanhe suas conquistas e veja de onde vem cada valor.</p><div className="commission-intro-pill">Clareza em cada etapa do funil <span>↗</span></div><div className="commission-orbit" aria-hidden="true"><span>R$</span><i /><i /></div></section>
    <section className="commission-login-card"><span className="commission-lock" aria-hidden="true">↗</span><h2>Minhas comissões</h2><p>Entre com seu acesso para consultar seus resultados.</p><form onSubmit={submit}><label>Login<input name="username" autoComplete="username" required placeholder="Seu login" autoCapitalize="none" spellCheck="false" /></label><label>Senha<input name="password" type="password" autoComplete="current-password" required placeholder="Sua senha" /></label>{error && <p role="alert" className="commission-error">{error}</p>}<button className="commission-primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar →'}</button></form><small>Acesso individual aos seus resultados.</small></section>
  </div></main>;
}
function Goal({ kind, info }) {
  const scheduled = kind === 'scheduled';
  return <section className="commission-goal"><div className="commission-goal-heading"><span>{scheduled ? 'GMV de agendamento' : 'GMV de agenciamento'}</span><strong>{info.ratio === null ? 'Sem meta' : pct(info.ratio)}</strong></div><div className="commission-progress"><span style={{ width: `${Math.min(100, (info.ratio || 0) * 100)}%` }} /></div><div className="commission-goal-values"><span><small>Realizado</small>{money(info.gmv)}</span><span><small>Meta mensal</small>{money(info.goal)}</span></div><p>{scheduled ? `${names.scheduled}: ${pct(info.band?.scheduled)}` : `${names.closer} / Closer: ${pct(info.band?.closer)} · ${names.agency}: ${pct(info.band?.agency)}`}</p>{info.ratio !== null && !info.band && <small>Comissões inativas. Ativação a partir de 50% da meta correspondente.</small>}</section>;
}
function TeamGoals({ team }) {
  return <section className="commission-section"><div className="commission-section-title"><div><h2>Metas da equipe</h2></div><span className="commission-tag">Metas do mês completo</span></div><div className="commission-goals"><Goal kind="scheduled" info={team.scheduled} /><Goal kind="agency" info={team.agency} /></div></section>;
}
function ComponentCard({ role, data, bruno }) {
  const title = bruno ? 'Agenciamentos · Closer' : names[role];
  return <section className={`commission-part commission-part-${role}`}><div className="commission-part-top"><span className="commission-part-icon" aria-hidden="true">{role === 'scheduled' ? '◷' : role === 'agency' ? '↗' : '✓'}</span><span className="commission-rate">{pct(data.rate)}</span></div><h3>{title}</h3><div className="commission-part-value">{commissionValue(data.commission, data.inactive)}</div><p>{bruno ? 'Sua parcela de closer nos leads agenciados.' : hints[role]}</p><dl><div><dt>Leads</dt><dd>{data.count}</dd></div><div><dt>GMV</dt><dd>{money(data.gmv)}</dd></div><div><dt>Receita Amplify · 1%</dt><dd>{money(data.revenue)}</dd></div></dl></section>;
}
function Projections({ report, bruno }) {
  const roles = Object.keys(report.totals);
  const labels = { ...names, closer: bruno ? 'Agenciamentos · Closer' : names.closer };
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const scenarios = report.rules.map(rule => {
    const parts = roles.map(role => {
      const rate = role === 'scheduled' ? rule.scheduled : role === 'agency' ? rule.agency : rule.closer;
      const fixedGmv = role === 'closer' && roles.includes('scheduled');
      const goal = report.team[role === 'scheduled' ? 'scheduled' : 'agency'].goal;
      const gmv = fixedGmv ? report.totals[role].gmv : goal > 0 ? goal * rule.min : null;
      return { role, rate, gmv, amount: gmv === null ? null : round(gmv * .01 * rate) };
    });
    return { min: rule.min, parts, total: parts.some(part => part.amount === null) ? null : round(parts.reduce((sum, part) => sum + part.amount, 0)) };
  });
  return <section className="commission-section commission-projections">
    <div className="commission-section-title"><div><h2>Projeção de comissões</h2><p>Compare quanto você receberia em cada faixa de meta da equipe.</p></div><span className="commission-tag">Simulação · {monthLabel(report.month)}</span></div>
    <div className="commission-projection-basis">{roles.includes('scheduled') && <strong>Base: comissões de reuniões validadas + Agendados e agenciados + agenciamentos pelo SDR.</strong>}{roles.includes('scheduled') && <p><b>Reuniões validadas:</b> a projeção usa a meta mensal de GMV agendado × a faixa de atingimento, com o percentual de comissão correspondente.</p>}{roles.includes('agency') && <p><b>Agendados e agenciados:</b> considera o GMV total agenciado no mês, independentemente de quem agendou. A projeção usa a meta mensal de GMV de agenciamento × a faixa de atingimento. Comissão ativa a partir de 100% dessa meta.</p>}<p><b>{labels.closer}:</b> {bruno ? 'leads fechados por você.' : 'reuniões em que o SDR agendou e atuou como closer.'} O percentual varia conforme o atingimento da meta de agenciamento. {bruno ? 'A projeção usa a meta mensal de GMV de agenciamento × a faixa de atingimento.' : '(Nesta parcela, a simulação mantém o GMV já realizado e varia apenas o percentual de comissão.)'}</p></div>
    <div className="commission-projection-scroll" tabIndex={0} role="region" aria-label="Comparativo de projeções de comissão">
      <table className={bruno ? 'commission-projection-table commission-projection-bruno' : 'commission-projection-table'}><thead><tr><th scope="col">Meta atingida</th>{roles.map(role => <th key={role} scope="col">{labels[role]}</th>)}<th scope="col">Comissão total</th></tr></thead><tbody>
        <tr className="commission-projection-current"><th scope="row">Atual<small>Faixas da equipe</small></th>{roles.map(role => <td key={role}><strong>{commissionValue(report.totals[role].commission, report.totals[role].inactive)}</strong><small>{pct(report.totals[role].rate)} da receita</small></td>)}<td><strong>{commissionValue(report.total, allInactive(Object.values(report.totals)))}</strong><small>Valor atual estimado</small></td></tr>
        {scenarios.map(scenario => <tr key={scenario.min}><th scope="row">{pct(scenario.min)}<small>da meta da equipe</small></th>{scenario.parts.map(part => <td key={part.role}><strong>{money(part.amount)}</strong><small>GMV: {money(part.gmv)}</small><small>{pct(part.rate)} da receita</small></td>)}<td className="commission-projection-result"><strong>{money(scenario.total)}</strong><small>{report.total === null || scenario.total === null ? 'Cenário simulado' : `${scenario.total >= report.total ? '+' : '−'} ${money(Math.abs(scenario.total - report.total))} vs. atual`}</small></td></tr>)}
      </tbody></table>
    </div>
    <p className="commission-rounding">Comissão = GMV do cenário × 1% de receita Amplify × percentual da faixa. O total soma as parcelas. Simulação, não valor a receber. No celular, deslize a tabela.</p>
  </section>;
}
export default function Commissions() {
  const [account, setAccount] = useState(null);
  const [checking, setChecking] = useState(true);
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7));
  const [person, setPerson] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectionFilter, setSelectionFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' });
  const [saving, setSaving] = useState('');
  const [selectionMessage, setSelectionMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { api('session').then(r => setAccount(r.account)).catch(() => {}).finally(() => setChecking(false)); }, []);
  useEffect(() => {
    if (!account) return;
    const controller = new AbortController(); setReport(null); setError('');
    api(`report?month=${month}&person=${encodeURIComponent(person)}`, { signal: controller.signal }).then(setReport).catch(err => { if (err.name === 'AbortError') return; if (err.status === 401) setAccount(null); else setError(err.message); });
    return () => controller.abort();
  }, [account, month, person, refresh]);
  useEffect(() => { if (!account) return; const timer = setInterval(() => setRefresh(x => x + 1), 300000); return () => clearInterval(timer); }, [account]);
  useEffect(() => { setCategory('all'); setSelectionFilter('all'); setSelectionMessage(''); }, [month, person, account]);
  async function logout() { try { await api('logout', { method: 'POST' }); setAccount(null); setReport(null); setPerson(''); setCategory('all'); setSelectionFilter('all'); setSelectionMessage(''); } catch (err) { setError(err.message); } }
  async function toggleLead(lead) {
    if (saving) return;
    setSaving(lead.id); setError(''); setSelectionMessage('Salvando marcação…');
    try {
      const updated = await api('selection', { method: 'POST', body: JSON.stringify({ month: report.month, person: report.person.id, leadId: lead.id, included: !lead.included }) });
      setReport(updated);
      setSelectionMessage(lead.included ? `${lead.label}: comissão retirada do total. Marcação salva.` : `${lead.label}: comissão incluída novamente. Marcação salva.`);
    } catch (err) { if (err.status === 401) setAccount(null); setError(err.message); setSelectionMessage('Não foi possível salvar. A marcação anterior foi mantida.'); }
    finally { setSaving(''); }
  }
  if (checking) return <main className="commission-shell"><p role="status">Carregando seu acesso…</p></main>;
  if (!account) return <Login onLogin={setAccount} />;
  if (account === 'gestao') return report ? <CommissionManagement report={report} month={month} onMonth={setMonth} onLogout={logout} onReport={setReport} teamGoals={<TeamGoals team={report.team} />} /> : <main className="commission-shell">{error ? <div className="commission-error" role="alert">{error}<button onClick={() => setRefresh(x => x + 1)}>Tentar novamente</button></div> : <p role="status">Carregando visão de gestão…</p>}<button className="commission-quiet" onClick={logout}>Sair</button></main>;
  const bruno = account === 'brunozardo';
  function toggleSort(key) { setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' })); }
  const sortArrow = key => sort.key === key ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ' ↕';
  const leads = (report?.leads || []).filter(x => `${x.label} ${x.status}`.toLowerCase().includes(search.toLowerCase()) && matchesCategory(x, category) && (selectionFilter === 'all' || (selectionFilter === 'included' ? x.included : !x.included))).sort((a, b) => {
    const left = sort.key === 'commission' ? leadAmount(a) : a[sort.key];
    const right = sort.key === 'commission' ? leadAmount(b) : b[sort.key];
    if (left === null || right === null) return left === right ? a.label.localeCompare(b.label, 'pt-BR', { numeric: true }) : left === null ? 1 : -1;
    const difference = typeof left === 'number' ? left - right : String(left).localeCompare(String(right), 'pt-BR', { numeric: true, sensitivity: 'base' });
    return difference * (sort.direction === 'asc' ? 1 : -1) || a.label.localeCompare(b.label, 'pt-BR', { numeric: true });
  });
  const months = [...new Set([month, ...(report?.months || [])])].sort().reverse();
  const includedInList = leads.filter(lead => lead.included);
  function exportCsv() {
    const labels = { ...names, ...((bruno || !report.knownRole) ? { closer: 'Agenciamentos · Closer' } : {}) };
    const url = URL.createObjectURL(new Blob([commissionCsv(report, leads, labels)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `detalhamento-comissao-${report.month}-${String(report.person.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const listGmv = includedInList.reduce((sum, lead) => sum + lead.gmv, 0);
  const listCommission = includedInList.some(lead => leadAmount(lead) === null) ? null : includedInList.reduce((sum, lead) => sum + leadAmount(lead), 0);
  return <main className="commission-shell">
    <header className="commission-header"><div><Brand /><span className="commission-overline">SEUS RESULTADOS, EM DETALHE</span><h1>Plano Sniper<span> / Comissões</span></h1><p>{report?.person.name || 'Carregando…'} <span className="commission-live">● Sincronização automática</span></p></div><div className="commission-header-actions"><label>Mês de referência<select disabled={!!saving} value={month} onChange={e => { setMonth(e.target.value); setSearch(''); }}>{months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label><button className="commission-quiet" disabled={!!saving} onClick={logout}>Sair ↗</button></div></header>
    {error && <div className="commission-error" role="alert">{error} <button onClick={() => setRefresh(x => x + 1)}>Tentar novamente</button></div>}
    {!report && !error && <div className="commission-loading" role="status">Preparando suas comissões…</div>}
    {report && <>
      {account === 'outro' && <label className="commission-member">Membro<select disabled={!!saving} value={report.person.id} onChange={e => { setPerson(e.target.value); setSearch(''); }}>{report.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      <div className="commission-period"><span>◷ {date(report.start)} a {date(report.end)}</span><span>{report.month === '2026-10' ? 'Outubro: registros anteriores a 08/10 desconsiderados.' : 'Mês completo.'}</span></div>
      {!report.knownRole && <div className="commission-notice">Os indicadores deste membro estão disponíveis. O papel de comissão ainda precisa ser definido; nenhum valor foi presumido.</div>}
      {report.rulesStale && <div className="commission-notice">Planilha de percentuais temporariamente indisponível. Exibindo a última tabela confirmada, de {new Date(report.rulesUpdatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</div>}
      {report.fixedSalariesStale && <div className="commission-notice">Aba Fixos indisponível. Exibindo a última leitura válida, quando disponível.</div>}
      <section className="commission-total"><div><span className="commission-overline">REMUNERAÇÃO TOTAL ESTIMADA</span><strong>{money(remuneration(report.person, report.total).total)}</strong><p>{monthLabel(month)}</p><RemunerationSummary person={report.person} commission={report.total} /></div><div className="commission-total-note"><span>↗</span><p>Receita Amplify = 1% do GMV<br />Comissão conforme a faixa da equipe</p></div></section>
      <div className={`commission-parts ${bruno ? 'commission-parts-single' : ''}`}>{Object.entries(report.totals).map(([role, data]) => <ComponentCard key={role} role={role} data={data} bruno={bruno || !report.knownRole} />)}</div>
      <TeamGoals team={report.team} />
      <CommissionActivation team={report.team} />
      {report.knownRole && <Projections report={report} bruno={bruno} />}
      <section className="commission-section">
        <div className="commission-section-title"><div><h2>Detalhamento da comissão</h2></div><div className="commission-detail-actions"><label className="commission-search"><span className="sr-only">Buscar lead ou status</span><input placeholder="Buscar lead ou status…" value={search} onChange={e => setSearch(e.target.value)} /></label><button type="button" className="commission-quiet" disabled={!leads.length || !!saving} onClick={exportCsv} title="Exportar os leads dos filtros atuais, na ordem exibida">Exportar CSV</button></div></div>
        <div className="commission-list-controls">
          <div className="commission-category-filters" role="group" aria-label="Origem da comissão">
            {(bruno || !report.knownRole ? [['all', 'Todos os agenciados']] : [['all', 'Todos'], ['scheduled', names.scheduled], ['agency', names.agency], ['closer', names.closer]]).map(([key, label]) => <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)}>{label}<span>{report.leads.filter(x => matchesCategory(x, key)).length}</span></button>)}
          </div>
          <label className="commission-selection-filter">Mostrar<select aria-label="Mostrar" value={selectionFilter} onChange={e => setSelectionFilter(e.target.value)}><option value="all">Todos os leads</option><option value="included">Incluídos na comissão</option><option value="excluded">Desmarcados</option></select></label>
        </div>
        <div className="commission-sort-controls"><label>Ordenar por<select aria-label="Ordenar por" value={sort.key} onChange={e => setSort(current => ({ ...current, key: e.target.value }))}><option value="label">Criador</option><option value="status">Status</option><option value="date">Data de alteração</option><option value="gmv">GMV</option><option value="commission">Comissão</option></select></label><button type="button" onClick={() => setSort(current => ({ ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' }))}>{sort.direction === 'asc' ? '↑ Crescente' : '↓ Decrescente'}</button></div>
        <div className="commission-selection-help"><span>☑</span><p>Desmarque para retirar <strong>todas as parcelas deste lead</strong> da sua comissão neste mês. Você pode marcar novamente. Não altera o Notion, as metas da equipe nem a comissão de outro membro.</p></div>
        <div className="commission-selection-status"><span>{leads.length} de {report.leads.length} leads · {report.excludedCount} desmarcado(s)</span><span role="status">{selectionMessage || 'Filtros mudam apenas a lista; as marcações recalculam os cartões.'}</span></div>
        <div className="commission-list-heading commission-list-heading-selection"><button type="button" aria-label="Ordenar por criador" onClick={() => toggleSort('label')}>Incluir · Criador / status{sortArrow('label')}</button><button type="button" aria-label="Ordenar por data de alteração" onClick={() => toggleSort('date')}>Data de alteração{sortArrow('date')}</button><button type="button" aria-label="Ordenar por GMV" onClick={() => toggleSort('gmv')}>GMV{sortArrow('gmv')}</button><button type="button" aria-label="Ordenar por comissão" onClick={() => toggleSort('commission')}>Comissão{sortArrow('commission')}</button></div>
        <div className="commission-leads">{leads.length ? leads.map(lead => <div key={lead.id} className={`commission-selectable-lead ${!lead.included ? 'commission-lead-excluded' : ''}`}>
          <label className="commission-lead-check"><input type="checkbox" checked={lead.included} disabled={!!saving} onChange={() => toggleLead(lead)} aria-label={`Incluir ${lead.label} na comissão`} /><span className="sr-only">Incluir na comissão</span></label>
          <details className="commission-lead"><summary><span className="commission-lead-name"><strong>{lead.label}</strong><small>{lead.status}{!lead.included && <em>Fora da comissão</em>}</small></span><span className="commission-lead-date">{date(lead.date)}</span><span className="commission-lead-gmv">{money(lead.gmv)}</span><span className="commission-lead-amount">{!lead.included ? money(0) : allInactive(lead.parts) ? inactiveLabel : lead.parts.some(x => x.commission === null) ? 'A definir' : money(lead.parts.reduce((s, x) => s + x.commission, 0))}<i>⌄</i></span></summary><div className="commission-lead-detail"><p>Receita Amplify estimada: <strong>{money(lead.revenue)}</strong>{!lead.included && ' · Parcelas abaixo não entram no total.'}</p>{lead.parts.map(part => <div key={part.role}><span>{bruno || !report.knownRole ? 'Agenciamentos · Closer' : names[part.role]}</span><span>{pct(part.rate)}</span><strong>{commissionValue(part.commission, part.inactive)}</strong></div>)}</div></details>
        </div>) : <p className="commission-empty">{report.leads.length ? 'Nenhum lead encontrado com estes filtros.' : 'Nenhum lead elegível neste período.'}</p>}</div>
        <div className="commission-list-total" aria-label="Totais da tabela"><div><strong>Total da lista</strong><small>{includedInList.length} lead(s) marcado(s) · conforme os filtros</small></div><div className="commission-total-date-spacer" aria-hidden="true" /><div><small>GMV total</small><strong>{money(listGmv)}</strong></div><div><small>Comissão total</small><strong>{commissionValue(listCommission, includedInList.length > 0 && includedInList.every(lead => allInactive(lead.parts)))}</strong></div></div>
        <p className="commission-rounding">O total da lista soma os leads marcados que aparecem nos filtros atuais. O total dos cartões considera todos os leads marcados do mês e é calculado sobre o GMV de cada categoria; parcelas por lead são arredondadas e podem diferir em centavos.</p>
      </section>
      <footer className="commission-footer"><p>Critério: status atual e data “Alterado em”, no horário de Brasília. A atualização de um lead pode mudar o mês em que ele aparece.</p><p>Dados atualizados em {new Date(report.generatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · Percentuais da aba “Comissões”.</p></footer>
    </>}
  </main>;
}
