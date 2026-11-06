import { useState } from 'react';

const money = value => value == null ? 'Indisponível' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const date = value => value ? value.split('-').reverse().join('/') : '—';

export default function CreatorReturns({ data, month }) {
  const [member, setMember] = useState('all');
  if (!data || data.status !== 'available') return <section className="commission-section"><h2>Retorno dos criadores</h2><p>Base Creator Daily indisponível. As comissões comerciais continuam calculadas normalmente; retorno não foi substituído por zero.</p></section>;
  const rows = data.creators.filter(row => member === 'all' || row.memberIds.includes(member));
  const summary = member === 'all' ? data.team : data.members.find(item => item.person.id === member);
  return <section className="commission-section">
    <div className="commission-section-title"><h2>Retorno dos criadores × comissão comercial</h2><label>Responsável<select value={member} onChange={event => setMember(event.target.value)}><option value="all">Equipe · sem duplicar criadores</option>{data.members.map(item => <option key={item.person.id} value={item.person.id}>{item.person.name}</option>)}</select></label></div>
    <p className="commission-notice">Agenciados listados na comissão de {month}. Fonte: {data.source}, de {date(data.firstDay)} a {date(data.lastDay)}. Valores estimados, não recebimentos confirmados.</p>
    <div className="creator-return-cards">{[
      ['GMV acumulado dos criadores', summary.lifetimeGmv],
      ['Receita Amplify acumulada · 10%', summary.lifetimeRevenue],
      ['Comissão comercial calculada · mês', summary.salesCommission],
      ['Saldo estimado · acumulado − custo do mês', summary.balance],
    ].map(([label, value]) => <div className="creator-return-card" key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</div>
    <p>{summary.creators} criadores identificados · {summary.unmatched} cadastros sem correspondência segura. GMV no mês: <strong>{money(summary.monthGmv)}</strong> · Receita Amplify no mês: <strong>{money(summary.monthRevenue)}</strong>.</p>
    {data.monthCoverage && <p className="commission-rounding">Cobertura do mês: {date(data.monthCoverage.first_day)} a {date(data.monthCoverage.last_day)} · {data.monthCoverage.present_days} dias. {data.monthCoverage.full_calendar_month ? 'Mês completo.' : 'Mês parcial; não equivale ao fechamento mensal.'}</p>}
    {data.incompleteMonths.length > 0 && <p className="commission-notice">Há lacunas na base: {data.incompleteMonths.join(', ')}. O acumulado considera apenas os dias disponíveis.</p>}
    <div className="management-table-scroll" tabIndex={0} role="region" aria-label="Retorno por vendedor"><table className="management-table"><thead><tr><th>Vendedor</th><th>Criadores identificados</th><th>GMV acumulado</th><th>Receita Amplify acumulada</th><th>Comissão comercial · mês</th><th>Saldo estimado</th></tr></thead><tbody>{data.members.map(item => <tr key={item.person.id}><td>{item.person.name}</td><td>{item.creators}{item.unmatched > 0 && <small>{item.unmatched} sem correspondência</small>}</td><td>{money(item.lifetimeGmv)}</td><td>{money(item.lifetimeRevenue)}</td><td>{money(item.salesCommission)}</td><td>{money(item.balance)}</td></tr>)}</tbody></table></div>
    <details><summary>Detalhar retorno por criador ({rows.length})</summary><div className="management-table-scroll" tabIndex={0} role="region" aria-label="Retorno por criador"><table className="management-table"><thead><tr><th>Criador</th><th>Correspondência</th><th>GMV no mês</th><th>Receita Amplify no mês</th><th>GMV acumulado</th><th>Comissão estimada do criador · acumulada</th><th>Receita Amplify acumulada</th></tr></thead><tbody>{rows.map(row => <tr key={row.leadId}><td>{row.label}</td><td>{{ matched: 'Identificado', unmatched: 'Não encontrado', ambiguous: 'Ambíguo', unavailable: 'Indisponível' }[row.status]}</td><td>{money(row.monthGmv)}</td><td>{money(row.monthRevenue)}</td><td>{money(row.lifetimeGmv)}</td><td>{money(row.lifetimeCreatorCommission)}</td><td>{money(row.lifetimeRevenue)}</td></tr>)}</tbody></table></div></details>
    <p className="commission-rounding">{data.note}</p>
  </section>;
}
