import test from 'node:test';
import assert from 'node:assert/strict';
import { returnProjection } from './return-projection.mjs';
const creator = { status: 'matched', authorId: 'a', revenueDays: { dailyRevenue: [1, 2, 3].map(n => ({ day: `2026-11-0${n}`, revenue: 10 })) } };
const data = { lastDay: '2026-11-03', team: { lifetimeRevenue: 130 }, creators: [creator, creator] };
test('slope uses only the last three calendar days, ignoring older revenue', () => {
  const series = [1, 2, 3, 4, 5].map(n => ({ day: `2026-11-0${n}`, revenue: n < 3 ? 1 : 100 }));
  const source = { lastDay: '2026-11-05', team: { lifetimeRevenue: 302 }, creators: [{ ...creator, revenueDays: { dailyRevenue: series } }] };
  const result = returnProjection(source, '2026-11', 502);
  assert.equal(result.rate, 100);
  assert.equal(result.recentDays, 3);
  assert.equal(result.targetDay, '2026-11-07');
});
test('deduplicates creators and reconciles accumulated baseline; projects break-even', () => {
  const result = returnProjection(data, '2026-11', 150);
  assert.equal(result.rate, 10);
  assert.equal(result.points[0].actual, 110);
  assert.equal(result.points[2].actual, 130);
  assert.equal(result.targetDay, '2026-11-05');
  assert.equal(result.points.at(-1).projected, 150);
});
test('no forecast for zero rhythm, missing remuneration, insufficient observations or future month', () => {
  assert.equal(returnProjection(data, '2026-11', null).points.length, 0);
  assert.equal(returnProjection(data, '2026-12', 150).points.length, 0);
  const zero = { ...creator, revenueDays: { dailyRevenue: creator.revenueDays.dailyRevenue.map(p => ({ ...p, revenue: 0 })) } };
  assert.equal(returnProjection({ ...data, creators: [zero] }, '2026-11', 150).targetDay, null);
  const partial = { ...creator, revenueDays: { dailyRevenue: creator.revenueDays.dailyRevenue.map((p, i) => ({ ...p, revenue: i === 1 ? null : 10 })) } };
  const result = returnProjection({ ...data, creators: [partial] }, '2026-11', 150);
  assert.equal(result.rate, null);
  assert.equal(result.points[1].actual, null);
  assert.equal(result.partial, true);
});
test('already covered does not create future revenue and forecast horizon is capped', () => {
  assert.equal(returnProjection(data, '2026-11', 100).achieved, true);
  assert.equal(returnProjection(data, '2026-11', 100).points.length, 3);
  const result = returnProjection(data, '2026-11', 100000);
  assert.equal(result.beyondChart, true);
  assert.equal(result.points.length, 368);
});
