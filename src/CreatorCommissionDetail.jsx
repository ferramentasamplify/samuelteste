const money = value => value == null ? 'Indisponível' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function CreatorCommissionDetail({ lead, data, member }) {
  const row = data?.creators?.find(item => item.leadId === lead.id);
  if (!row) return null;
  const contributions = lead.commissions.filter(item => member === 'all' || item.person.id === member);
  const parts = contributions.filter(item => item.included).flatMap(item => item.parts);
  const cost = parts.some(part => part.commission == null || part.inactive) ? null : parts.reduce((total, part) => total + part.commission, 0);
  return <details className="creator-commission-detail">
    <summary>Ver retorno e comissão deste criador</summary>
    {row.status !== 'matched' ? <p>Creator Daily: {row.status === 'ambiguous' ? 'correspondência ambígua' : row.status === 'unavailable' ? 'base indisponível' : 'criador não identificado'}. Valores não substituídos por zero.</p> : <>
      <dl>
        <div><dt>GMV gerado · mês selecionado</dt><dd>{money(row.monthGmv)}</dd></div>
        <div><dt>Receita Amplify estimada · mês</dt><dd>{money(row.monthRevenue)}</dd></div>
        <div><dt>Comissão comercial calculada · mês / filtro atual</dt><dd>{money(cost)}</dd></div>
        <div><dt>Receita menos comissão comercial · mês</dt><dd>{money(row.monthRevenue == null || cost == null ? null : row.monthRevenue - cost)}</dd></div>
        <div><dt>GMV acumulado · histórico disponível</dt><dd>{money(row.lifetimeGmv)}</dd></div>
        <div><dt>Receita Amplify estimada · histórico disponível</dt><dd>{money(row.lifetimeRevenue)}</dd></div>
      </dl>
      <p className="commission-rounding">Creator Daily até {data.lastDay?.split('-').reverse().join('/')}. Receita estimada = comissão do criador × 10%; não é recebimento confirmado. Histórico disponível, não apenas após a entrada. GMV do cadastro e regras da comissão comercial permanecem iguais.</p>
      {data.monthCoverage && <p className="commission-rounding">Mês selecionado: {data.monthCoverage.present_days} dias disponíveis{data.monthCoverage.full_calendar_month ? '.' : ' · mês parcial.'}</p>}
    </>}
  </details>;
}
