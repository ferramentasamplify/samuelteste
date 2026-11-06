import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { commissionReport } from './commission-model.mjs';
test('three authorized exceptions move SDR parts only; closer and team stay unchanged', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../public/luiz-contatos.json', import.meta.url)));
  const names = ['melissabfsilva', 'letibuzetti', 'dudapristupa'];
  const october = commissionReport(data, '2026-10', 'keizepassos');
  const november = commissionReport(data, '2026-11', 'keizepassos');
  const closer = commissionReport(data, '2026-11', 'brunozardo');
  for (const name of names) {
    assert.deepEqual(october.leads.find(row => row.label === name)?.parts.map(part => part.role), ['scheduled']);
    assert.deepEqual(november.leads.find(row => row.label === name)?.parts.map(part => part.role), ['agency']);
    assert.deepEqual(closer.leads.find(row => row.label === name)?.parts.map(part => part.role), ['closer']);
  }
  assert.ok(november.leads.some(row => row.label === 'baratodiatodo'));
  const baseline = { ...data, creators: data.creators.map(row => ({ ...row, id: `unmodified-${row.id}` })) };
  const movedGmv = data.creators.filter(row => names.includes(row.creatorId)).reduce((sum, row) => sum + row.gmv, 0);
  for (const month of ['2026-10', '2026-11']) {
    const actual = commissionReport(data, month, 'keizepassos').team;
    const before = commissionReport(baseline, month, 'keizepassos').team;
    assert.deepEqual(actual.agency, before.agency);
    assert.equal(actual.scheduled.goal, before.scheduled.goal);
    assert.equal(actual.scheduled.gmv, before.scheduled.gmv + (month === '2026-10' ? movedGmv : -movedGmv));
  }
  assert.equal(october.totals.scheduled.rate, .034);
});
