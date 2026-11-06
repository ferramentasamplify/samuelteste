const pct = value => value == null ? 'A definir' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(value);

export default function CommissionActivation({ team }) {
  const types = [
    { key: 'scheduled', title: 'SDR · Reuniões validadas', goal: 'scheduled', trigger: .5, description: 'Reuniões com os critérios BANT aprovados.' },
    { key: 'agency', title: 'SDR · Agendados e agenciados', goal: 'agency', trigger: 1, description: <>Comissão total sob GMV total agendado e agenciado no mês.<br />(Esta comissão só é ativa a partir de 100% da meta de agenciamento atingida.)</> },
    { key: 'closer', title: 'Closer · Agenciamentos', goal: 'agency', trigger: .5, description: 'Reuniões fechadas' },
  ];
  return <section className="commission-section commission-activation" aria-label="Ativação das comissões">
    <div className="commission-section-title"><div><h2>Percentuais e comissões ativas</h2><p>Ativação conforme o atingimento das metas da equipe no mês selecionado.</p></div></div>
    <div className="commission-activation-grid">{types.map(type => {
      const info = team[type.goal];
      const known = info?.ratio != null;
      const rate = info?.band?.[type.key];
      const active = known && info.ratio + 1e-10 >= type.trigger && rate > 0;
      return <article key={type.key} className={`commission-activation-card ${active ? 'is-active' : ''}`}>
        <h3>{type.title}</h3><strong className="commission-activation-rate">{known ? pct(active ? rate : 0) : 'A definir'}</strong>
        <dl><div><dt>Gatilho de ativação</dt><dd>{active ? <>{pct(info.band.min)} da meta de {type.goal === 'scheduled' ? 'agendamento' : 'agenciamento'}</> : known ? 'Nenhuma faixa ativa' : 'Meta indisponível'}</dd></div></dl>
        <p className="commission-activation-description">{type.description}</p>
      </article>;
    })}</div>
    <p className="commission-rounding">Os percentuais acompanham a faixa atual da equipe; não são cumulativos. Ativação não confirma pagamento nem muda os critérios de elegibilidade de cada lead.</p>
  </section>;
}
