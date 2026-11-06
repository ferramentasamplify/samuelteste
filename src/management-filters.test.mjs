import test from 'node:test';
import assert from 'node:assert/strict';
import { filterManagementLeads, managementAmount } from './management-filters.mjs';
import { managementCsv } from './commission-csv.mjs';
const part = (role, commission) => ({ role, commission });
const item = (id, included, parts) => ({ person: { id, name: id }, included, parts });
const leads = [
  { id: 'shared', label: 'Criador 10', date: '2026-11-02', status: 'AGENCIADO', gmv: 200, sdr: 'Keize', closer: 'Bruno', commissions: [item('bruno', true, [part('closer', 10)]), item('keize', false, [part('scheduled', 2), part('agency', 3)])] },
  { id: 'solo', soleResponsibleRole: 'sdr', label: 'Criador 2', date: '2026-11-01', status: 'Convite Aceito', gmv: 100, sdr: 'Keize', closer: 'Keize', commissions: [item('keize', true, [part('scheduled', 2), part('agency', 3), part('closer', 20)])] },
];
test('management combines member, origin and inclusion without leaking other contributions into CSV', () => {
  const rows = filterManagementLeads(leads, { member: 'keize', category: 'agency', selection: 'excluded', search: 'Bruno' });
  assert.deepEqual(rows.map(x => x.id), ['shared']);
  assert.deepEqual(rows[0].commissions.map(x => x.person.id), ['keize']);
  assert.equal(managementAmount(rows[0]), 0);
  assert.equal(filterManagementLeads(leads, { member: 'bruno', selection: 'excluded' }).length, 0);
  assert.deepEqual(filterManagementLeads(leads, { member: 'keize', category: 'sdr-agency' }).map(x => x.id), ['solo']);
  assert.deepEqual(filterManagementLeads(leads, { category: 'sdr-agency' }).map(x => x.id), ['solo']);
  assert.equal(filterManagementLeads(leads, { member: 'bruno', category: 'sdr-agency' }).length, 0);
  assert.equal(filterManagementLeads(leads, { member: 'keize', category: 'scheduled' }).length, 0);
  const csv = managementCsv({ month: '2026-11' }, rows, {});
  assert.ok(csv.includes('"keize"')); assert.ok(!csv.includes('"bruno"'));
  assert.equal(leads[0].commissions.length, 2);
});
test('management ordering handles numeric names, GMV, commission and undefined amounts', () => {
  assert.deepEqual(filterManagementLeads(leads, { sort: { key: 'label', direction: 'asc' } }).map(x => x.id), ['solo', 'shared']);
  assert.deepEqual(filterManagementLeads(leads, { sort: { key: 'gmv', direction: 'desc' } }).map(x => x.id), ['shared', 'solo']);
  assert.deepEqual(filterManagementLeads(leads, { sort: { key: 'commission', direction: 'desc' } }).map(x => x.id), ['solo', 'shared']);
  const unknown = { ...leads[0], id: 'unknown', commissions: [item('bruno', true, [part('closer', null)])] };
  for (const direction of ['asc', 'desc']) assert.equal(filterManagementLeads([...leads, unknown], { sort: { key: 'commission', direction } }).at(-1).id, 'unknown');
});
test('five management filters use funnel statuses and sole responsible rather than commission recipient', () => {
  const closerOnly = { ...leads[0], id: 'closer-only', soleResponsibleRole: 'closer' };
  const meeting = { ...leads[0], id: 'meeting', status: 'Reunião Realizada' };
  const proposal = { ...leads[0], id: 'proposal', status: 'Enviar Convite' };
  const scheduled = { ...leads[0], id: 'scheduled', status: 'Reunião Agendada' };
  const rows = [...leads, closerOnly, meeting, proposal, scheduled];
  const ids = category => filterManagementLeads(rows, { category }).map(x => x.id).sort();
  assert.equal(ids('all').length, 6);
  assert.deepEqual(ids('scheduled'), ['meeting', 'proposal']);
  assert.deepEqual(filterManagementLeads([{ ...proposal, status: 'Convite Enviado' }], { category: 'scheduled' }).map(x => x.id), ['proposal']);
  assert.deepEqual(ids('sdr-agency'), ['solo']);
  assert.deepEqual(ids('closer-agency'), ['closer-only']);
  assert.deepEqual(ids('agency'), ['closer-only', 'shared', 'solo']);
  assert.equal(filterManagementLeads(rows, { category: 'closer-agency', member: 'keize' })[0].commissions[0].person.id, 'keize');
});
