import { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { returnProjection } from './return-projection.mjs';
const money = value => value == null ? 'Indisponível' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const date = day => day?.split('-').reverse().join('/');
export default function ReturnProjection({ data, month, remuneration }) {
  const [open, setOpen] = useState(false);
  const projection = useMemo(() => open ? returnProjection(data, month, remuneration) : null, [open, data, month, remuneration]);
  return <details className="commission-section return-projection" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Projeção de retorno <span>Receita × remuneração total ⌄</span></summary>
    {open && (projection.reason ? <p>{projection.reason}</p> : <>
      <div className="projection-indicators"><div><small>Ritmo diário · últimos 3 dias</small><strong>{money(projection.rate)}/dia</strong></div><div><small>Falta para cobrir a remuneração</small><strong>{money(projection.remaining)}</strong></div><div><small>{projection.achieved ? 'Remuneração coberta' : 'Equilíbrio estimado'}</small><strong>{projection.targetDay ? date(projection.targetDay) : 'Sem previsão confiável'}</strong>{projection.daysToTarget != null && <small>Em {projection.daysToTarget} dias após {date(projection.latest)}</small>}</div></div>
      <ResponsiveContainer width="100%" height={320}><LineChart data={projection.points} margin={{ top: 15, right: 25, bottom: 10, left: 10 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tickFormatter={value => date(value).slice(0, 5)} minTickGap={40} /><YAxis width={75} tickFormatter={value => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(value)} /><Tooltip labelFormatter={date} formatter={value => money(value)} /><Legend /><Line dataKey="actual" name="Receita acumulada" stroke="#0047ff" dot={false} strokeWidth={2} connectNulls={false} /><Line dataKey="projected" name="Receita projetada" stroke="#157345" strokeDasharray="6 4" dot={false} strokeWidth={2} /><Line dataKey="target" name="Remuneração total" stroke="#c52b39" dot={false} strokeWidth={2} /></LineChart></ResponsiveContainer>
      <p className="commission-rounding">Do dia 1 do mês selecionado em diante. Receita acumulada inclui o saldo do histórico anterior, para coincidir com o indicador principal. Receita = comissão estimada dos criadores × 10%, não GMV. Criadores compartilhados contados uma única vez. Previsão linear pela média dos últimos 3 dias corridos até a última data da base ({date(projection.latest)}); exige dados completos nos 3 dias, sem buscar dias mais antigos para preencher lacunas. Sem presumir crescimento ou novas contratações. A remuneração do mês fica constante na simulação, mesmo se a previsão ultrapassar o mês; não inclui novos salários futuros nem comprova pagamento.</p>
      {projection.partial && <p className="commission-rounding">Histórico parcial: lacunas não são tratadas como zero. A previsão usa somente dias com dados completos dos criadores identificados.</p>}
      {projection.beyondChart && <p className="commission-rounding">A data estimada está além de 365 dias; o gráfico exibe apenas esse horizonte.</p>}
    </>)}
  </details>;
}
