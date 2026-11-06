import test from 'node:test';
import assert from 'node:assert/strict';
import { leadNumbers, tableTotals, sortReturnLeads } from './management-totals.mjs';
test('unmatched sales use explicit zero assumption for return; outages and ambiguity stay unknown', () => {
  const lead = { id: 'a', status: 'AGENCIADO', commissions: [{ person: { id: 'sdr' }, included: true, parts: [{ commission: 59.02 }] }] };
  const data = status => ({ creators: [{ leadId: 'a', status }] });
  assert.deepEqual(leadNumbers(lead, data('unmatched')).slice(1, 5), [0, 0, 59.02, -59.02]);
  for (const status of ['ambiguous', 'unavailable']) assert.equal(leadNumbers(lead, data(status))[4], null);
});
test('non-agenciados have zero GMV, while missing data for agenciados stays unknown', () => {
  const base = { id: 'a', label: 'a', commissions: [] };
  for (const status of ['Reunião Realizada', 'Enviar Convite', 'Convite Enviado']) assert.equal(leadNumbers({ ...base, status }, {})[1], 0);
  for (const status of ['AGENCIADO', 'Convite Aceito']) assert.equal(leadNumbers({ ...base, status }, {})[1], null);
});
test('non-agenciado return subtracts commission from zero revenue, including filters and totals', () => {
  const lead = { id: 'a', status: 'Reunião Realizada', gmv: 173600, commissions: [{ person: { id: 'sdr' }, included: true, parts: [{ commission: 59.02 }] }, { person: { id: 'closer' }, included: false, parts: [{ commission: 20 }] }] };
  const values = leadNumbers(lead, {});
  assert.equal(values[2], 0);
  assert.equal(values[4], -59.02);
  assert.equal(tableTotals([values, values])[4].value, -118.04);
  assert.equal(leadNumbers(lead, {}, 'closer')[4], 0);
  assert.equal(leadNumbers({ ...lead, status: 'AGENCIADO' }, {})[4], null);
});
test('numeric return sorting works in both directions, with missing values last', () => {
  const leads = ['a', 'b', 'c'].map(id => ({ id, label: id, commissions: [] }));
  const data = { creators: [{ leadId: 'a', status: 'matched', lifetimeGmv: 20 }, { leadId: 'b', status: 'matched', lifetimeGmv: 100 }] };
  for (const [direction, expected] of [['asc', ['a', 'b', 'c']], ['desc', ['b', 'a', 'c']]]) assert.deepEqual(sortReturnLeads(leads, data, 'all', { key: 'generatedGmv', direction }).map(row => row.id), expected);
});
test('totals sum visible rows without treating unknown values as confirmed zeros', () => {
  const totals = tableTotals([[10, 100, 20, 5, 15, 6], [30, null, null, 2, null, null]]);
  assert.deepEqual(totals[0], { value: 40, partial: false });
  assert.deepEqual(totals[2], { value: 20, partial: true });
  assert.deepEqual(totals[3], { value: 7, partial: false });
});
test('cost honors member filter and excludes uncommissioned contributions', () => {
  const lead = { id: 'a', gmv: 10, commissions: [{ person: { id: 'sdr' }, included: true, parts: [{ commission: 5 }] }, { person: { id: 'closer' }, included: true, parts: [{ commission: 7 }] }, { person: { id: 'other' }, included: false, parts: [{ commission: 99 }] }] };
  const data = { creators: [{ leadId: 'a', status: 'matched', lifetimeGmv: 100, lifetimeRevenue: 20, revenueDays: { days: 6 } }] };
  assert.deepEqual(leadNumbers(lead, data), [10, 100, 20, 12, 8, 6]);
  assert.equal(leadNumbers(lead, data, 'sdr')[4], 15);
});
