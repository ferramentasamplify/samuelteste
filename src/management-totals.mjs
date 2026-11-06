export const isNonAgenciado = lead => typeof lead.status === 'string' && !['AGENCIADO', 'Convite Aceito'].includes(lead.status);
// For return analysis, Bruno requested zero for agenciados not yet in sales.
// Keep source outages and ambiguous matches unknown, and label this assumption.
export const assumesZeroReturn = row => row?.status === 'unmatched';

export function leadNumbers(lead, data, member = 'all') {
  const row = data?.creators?.find(item => item.leadId === lead.id);
  const matched = row?.status === 'matched';
  const parts = lead.commissions.filter(item => item.included && (member === 'all' || item.person.id === member)).flatMap(item => item.parts);
  const cost = parts.some(part => part.commission == null || part.inactive) ? null : parts.reduce((sum, part) => sum + part.commission, 0);
  const zero = isNonAgenciado(lead) || assumesZeroReturn(row);
  const revenue = zero ? 0 : matched ? row.lifetimeRevenue : null;
  return [lead.gmv, zero ? 0 : matched ? row.lifetimeGmv : null, revenue, cost, revenue != null && cost != null ? revenue - cost : null, matched ? row.revenueDays?.days ?? null : null];
}
export function tableTotals(rows) {
  return Array.from({ length: 6 }, (_, index) => {
    const values = rows.map(row => row[index]).filter(Number.isFinite);
    return { value: values.length ? values.reduce((sum, value) => sum + value, 0) : null, partial: values.length < rows.length };
  });
}
export const returnSortColumns = [['generatedGmv', 'GMV gerado'], ['generatedRevenue', 'Receita Amplify'], ['estimatedCommission', 'Comissão Estimada'], ['returnBalance', 'Margem'], ['revenueDuration', 'Dias gerando receita']];
export function sortReturnLeads(leads, data, member, sort) {
  const index = returnSortColumns.findIndex(([key]) => key === sort.key) + 1;
  if (!index) return leads;
  const values = new Map(leads.map(lead => [lead.id, leadNumbers(lead, data, member)[index]]));
  return [...leads].sort((a, b) => {
    const left = values.get(a.id), right = values.get(b.id);
    const tie = a.label.localeCompare(b.label, 'pt-BR', { numeric: true });
    if (left == null || right == null) return left == right ? tie : left == null ? 1 : -1;
    return (left - right) * (sort.direction === 'asc' ? 1 : -1) || tie;
  });
}
