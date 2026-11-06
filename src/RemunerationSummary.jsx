import { remuneration } from './remuneration.mjs';
const money = value => value == null ? 'A definir' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export default function RemunerationSummary({ person, commission }) {
  const result = remuneration(person, commission);
  return <div className="remuneration-breakdown"><span>{person?.fixedSalaryNote ? 'Fixo proporcional' : 'Fixo mensal'} <b>{money(result.fixed)}</b></span>{person?.fixedSalaryNote && <small>{person.fixedSalaryNote}</small>}<span>Comissão estimada <b>{money(result.commission)}</b></span><span>Remuneração total <b>{money(result.total)}</b></span></div>;
}
