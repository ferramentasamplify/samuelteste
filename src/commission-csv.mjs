const decimal = value => value == null ? 'A definir' : value.toFixed(2).replace('.', ',');
const cell = value => {
  const text = String(value ?? '');
  const safe = /^[\s\uFEFF]*[=+@-]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

export function managementCsv(report, leads, labels) {
  const rows = [['Mês', 'Criador', 'Status', 'Data', 'SDR', 'Closer', 'GMV (R$)', 'Comissionado', 'Incluído', 'Parcela', 'Percentual', 'Comissão (R$)', 'Considerado na meta', 'Motivo da exclusão']];
  for (const lead of leads) for (const item of lead.commissions) for (const part of item.parts) rows.push([report.month, lead.label, lead.status, lead.date, lead.sdr, lead.closer, decimal(lead.gmv), item.person.name, item.included ? 'Sim' : 'Não', labels[part.role], part.rate == null ? 'Sem faixa' : `${part.rate * 100}%`, !item.included ? '0,00' : part.inactive ? 'Comissões inativas' : decimal(part.commission), lead.metaIncluded === false ? 'Não' : 'Sim', lead.exclusionReason || '']);
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function commissionCsv(report, leads, labels) {
  const rows = [['Mês', 'Responsável', 'Criador', 'Status', 'Data de alteração', 'Incluído na comissão', 'GMV (R$)', 'Receita Amplify (R$)', 'Comissão (R$)', 'Parcelas']];
  for (const lead of leads) {
    const amount = !lead.included ? '0,00' : lead.parts.length && lead.parts.every(part => part.inactive) ? 'Comissões inativas' : decimal(lead.parts.some(part => part.commission == null) ? null : lead.parts.reduce((sum, part) => sum + part.commission, 0));
    const parts = lead.parts.map(part => `${labels[part.role] || part.role}: ${part.rate == null ? 'Sem faixa' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(part.rate * 100)}%`} · ${part.inactive ? 'Comissões inativas' : decimal(part.commission)}${!lead.included ? ' (fora do total)' : ''}`).join(' | ');
    rows.push([report.month, report.person.name, lead.label, lead.status, lead.date?.split('-').reverse().join('/'), lead.included ? 'Sim' : 'Não', decimal(lead.gmv), decimal(lead.revenue), amount, parts]);
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
