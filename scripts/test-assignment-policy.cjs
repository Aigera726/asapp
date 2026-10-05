const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exports_ = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('src/database/assignmentPolicy.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText, { exports: exports_, Set, Number });
const { isEligibleAssignment, actualValue, unavailableAssignments, readAllView } = exports_;

(async () => {
  for (const status of ['DRAFT', 'PENDING_APPROVAL', 'REVISION', 'REJECTED', 'ACTIVE', 'CLOSED', null]) {
    assert.equal(isEligibleAssignment({ contract_status: status, estimate_type: 'actual' }), false);
  }
  assert.equal(isEligibleAssignment({ contract_status: 'APPROVED', estimate_type: 'actual' }), true);
  for (const type of ['planned', 'work', null, undefined]) {
    assert.equal(isEligibleAssignment({ contract_status: 'APPROVED', estimate_type: type }), false);
  }
  assert.equal(isEligibleAssignment({ contract_status: 'APPROVED', estimate_type: 'work', boq_source_id: 'boq' }), true);
  assert.equal(isEligibleAssignment({ contract_status: 'DRAFT', estimate_type: 'work', boq_source_id: 'boq' }), false);
  assert.equal(isEligibleAssignment({ contract_status: 'APPROVED', estimate_type: 'planned', boq_source_id: 'boq' }), false);
  assert.equal(isEligibleAssignment({ contract_status: 'APPROVED', estimate_type: 'work', boq_source_id: '' }), false);
  assert.equal(isEligibleAssignment({ contract_status: 'APPROVED', estimate_type: 'work', boq_source_id: 'boq', status: 'CANCELLED' }), false);
  assert.equal(actualValue(0, 3), 0);
  assert.equal(actualValue('2.5', 3), 2.5);
  assert.equal(actualValue(null, '3'), 3);
  assert.equal(actualValue(undefined, undefined), null);
  const old = [{ id: 'kept', is_available: true }, { id: 'revoked', contract_id: 'c', is_available: true, _status: 'synced' }];
  const hidden = unavailableAssignments(old, [{ id: 'kept' }]);
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].id, 'revoked');
  assert.equal(hidden[0].contract_id, 'c');
  assert.equal(hidden[0].is_available, false);
  assert.equal('_status' in hidden[0], false);
  assert.equal(old[1].is_available, true);
  assert.equal(unavailableAssignments(old, []).length, 2);
  assert.equal(unavailableAssignments(old, old).length, 0);
  // A server page cap smaller than the requested 500 must not truncate data.
  const all = Array.from({ length: 253 }, (_, id) => ({ id }));
  const offsets = [];
  const client = { from() { return this; }, select() { return this; }, order() { return this; },
    async range(start) { offsets.push(start); return { data: all.slice(start, start + 100), error: null }; } };
  const result = await readAllView(client, 'v_assignments');
  assert.equal(result.data.length, 253);
  assert.deepEqual(offsets, [0, 100, 200, 253]);
  client.range = async () => ({ data: null, error: { message: 'offline' } });
  assert.equal((await readAllView(client, 'v_assignments')).data, null);
  console.log('PASS: statuses, actual version, zero/null facts, cache withdrawal, pagination, fetch failure');
})().catch((error) => { console.error(error); process.exitCode = 1; });
