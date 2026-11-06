import test from 'node:test';
import assert from 'node:assert/strict';
import { revenueDays } from './revenue-days.mjs';
const series = values => values.map((value, i) => ({ day: `2026-10-${String(14+i).padStart(2, '0')}`, value }));
test('three explicit zero days stop retroactively, before first zero', () => {
  assert.deepEqual(revenueDays(series([1,1,1,1,1,1,0,0,0,5])), { days: 6, status: 'paused', partial: false, stoppedAt: '2026-10-20' });
});
test('short zero sequences do not stop counting', () => {
  assert.equal(revenueDays(series([1,0,0,1])).days, 4);
});
test('unknown days and calendar gaps cannot confirm three consecutive zero days', () => {
  assert.equal(revenueDays(series([1,0,null,0,0])).status, 'active');
  const days = series([1,0,0,0]); days[2].day = '2026-10-18'; days[3].day = '2026-10-19';
  assert.equal(revenueDays(days).status, 'active');
});
test('leading zeros do not start a period', () => {
  assert.equal(revenueDays(series([0,0,1,1])).days, 2);
  assert.equal(revenueDays(series([0,0,0])).days, null);
});
