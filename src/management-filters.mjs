export const managementCategories = [['all', 'Todos'], ['scheduled', 'Reuniões validadas'], ['sdr-agency', 'Agendados e agenciados • SDR'], ['agency', 'Agenciados']];
const agencyStatuses = ['AGENCIADO', 'Convite Aceito'];
const realizedStatuses = ['Reunião Realizada', 'Enviar Convite', 'Convite Enviado'];
const matchesCategory = (lead, category) => {
  if (category === 'all') return true;
  if (category === 'scheduled') return realizedStatuses.includes(lead.status);
  if (!agencyStatuses.includes(lead.status)) return false;
  return category === 'agency' || category === 'sdr-agency' && lead.soleResponsibleRole === 'sdr' || category === 'closer-agency' && lead.soleResponsibleRole === 'closer';
};
export const managementAmount = lead => {
  const parts = lead.commissions.filter(item => item.included).flatMap(item => item.parts);
  return parts.some(part => part.commission == null) ? null : parts.reduce((sum, part) => sum + part.commission, 0);
};
export function filterManagementLeads(leads, { search = '', member = 'all', category = 'all', selection = 'all', sort = { key: 'date', direction: 'desc' } } = {}) {
  return leads.filter(lead => matchesCategory(lead, category)).map(lead => ({ ...lead, commissions: lead.commissions.filter(item => (member === 'all' || item.person.id === member) && (selection === 'all' || (selection === 'included' ? item.included : !item.included))) }))
    .filter(lead => lead.commissions.length && `${lead.label} ${lead.status} ${lead.sdr} ${lead.closer}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const left = sort.key === 'commission' ? managementAmount(a) : a[sort.key];
      const right = sort.key === 'commission' ? managementAmount(b) : b[sort.key];
      const tie = a.label.localeCompare(b.label, 'pt-BR', { numeric: true });
      if (left == null || right == null) return left == right ? tie : left == null ? 1 : -1;
      const difference = typeof left === 'number' ? left - right : String(left).localeCompare(String(right), 'pt-BR', { numeric: true, sensitivity: 'base' });
      return difference * (sort.direction === 'asc' ? 1 : -1) || tie;
    });
}
