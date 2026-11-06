import test from 'node:test';
import assert from 'node:assert/strict';
import { managementReturns } from './creator-returns.mjs';

const row = (id, alias, gmv, commission) => ({ author_id: id, author_alias: alias, aliases: alias, sum_cl_pay_amt: gmv, pre_estimated_commission: commission });
const source = { months: [{ month: '2026-10', coverage: { first_day: '2026-10-01', last_day: '2026-10-31', present_days: 31, full_calendar_month: true }, items: [row('1', 'creator', 1000, 80), row('2', 'collision', 100, 10)] }, { month: '2026-11', coverage: { first_day: '2026-11-01', last_day: '2026-11-03', present_days: 3 }, items: [row('1', 'new.handle', 500, 20), row('3', 'collision', 900, 90)] }] };
const dataset = { creators: [{ id: 'a', creatorId: '@creator' }, { id: 'duplicate', creatorId: '1' }, { id: 'ambiguous', creatorId: 'collision' }, { id: 'missing', creatorId: 'unknown' }] };
const lead = (id, status = 'AGENCIADO') => ({ id, label: id, status, commissions: [{ person: { id: 'seller1' } }, { person: { id: 'seller2' } }] });
const report = { month: '2026-10', leads: [lead('a'), lead('duplicate'), lead('ambiguous'), lead('missing')], members: [{ person: { id: 'seller1' }, total: 5 }, { person: { id: 'seller2' }, total: 2 }] };

test('sums monthly daily-source aggregates, uses creator commission rather than GMV for agency revenue and deduplicates shared creators', () => {
  const result = managementReturns(report, dataset, source);
  assert.equal(result.team.creators, 1);
  assert.equal(result.team.lifetimeGmv, 1500);
  assert.equal(result.team.monthRevenue, 8);
  assert.equal(result.team.lifetimeRevenue, 10);
  assert.equal(result.team.salesCommission, 7);
  assert.equal(result.team.balance, 3);
  assert.equal(result.members[0].lifetimeRevenue, 10);
  assert.equal(result.members[1].lifetimeRevenue, 10);
});
test('ambiguous aliases and missing matches never become zero-valued creator returns', () => {
  const result = managementReturns(report, dataset, source);
  assert.equal(result.creators.find(row => row.leadId === 'ambiguous').status, 'ambiguous');
  assert.equal(result.creators.find(row => row.leadId === 'missing').lifetimeRevenue, null);
  assert.equal(result.team.unmatched, 2);
});
test('unavailable source is not reported as zero and non-agenciados do not become attributed revenue', () => {
  const unavailable = managementReturns(report, dataset, { unavailable: true, months: [] });
  assert.equal(unavailable.team.lifetimeRevenue, null);
  assert.equal(unavailable.team.balance, null);
  const result = managementReturns({ ...report, leads: [lead('a', 'Reunião Realizada')] }, dataset, source);
  assert.equal(result.creators.length, 0);
});
