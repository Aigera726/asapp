const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const exports_ = {};
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync('src/database/workVolume.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText, { exports: exports_, Math });
const { summarizeVolume, localPending } = exports_;

const base = {
  plan: 245, workConfirmed: 0, workPending: 0,
  assignmentLimit: null, assignmentConfirmed: 0, assignmentPending: 0,
  localWorkPending: 0, localAssignmentPending: 0,
};

// Отправили 200 — на подтверждении, доступно 45.
let s = summarizeVolume({ ...base, workPending: 200 });
assert.equal(s.pending, 200); assert.equal(s.available, 45); assert.equal(s.limit, 45);

// Подтвердили 120 из 200 — доступно 125.
s = summarizeVolume({ ...base, workConfirmed: 120 });
assert.equal(s.confirmed, 120); assert.equal(s.pending, 0); assert.equal(s.limit, 125);

// Отклонили — снова 245.
assert.equal(summarizeVolume(base).limit, 245);

// Отчёт ещё на устройстве тоже резервирует объём.
assert.equal(summarizeVolume({ ...base, localWorkPending: 200 }).limit, 45);

// Предел договора ниже остатка работы.
s = summarizeVolume({ ...base, assignmentLimit: 100, assignmentPending: 30, localAssignmentPending: 20 });
assert.equal(s.assignmentAvailable, 50); assert.equal(s.limit, 50);

// Перебор не уходит в минус; дроби без хвостов.
assert.equal(summarizeVolume({ ...base, workConfirmed: 250 }).limit, 0);
assert.equal(summarizeVolume({ ...base, plan: 0.3, workPending: 0.1 }).limit, 0.2);

// Локально учитываются только ожидающие отчёты, которых нет в истории сервера.
const reports = [
  { id: 'sent', assignmentId: 'a', reportedQuantity: 200, status: 'PENDING' },
  { id: 'offline', assignmentId: 'a', reportedQuantity: 10, status: 'PENDING' },
  { id: 'colleague', assignmentId: 'b', reportedQuantity: 5, status: 'PENDING' },
  { id: 'done', assignmentId: 'a', reportedQuantity: 7, status: 'APPROVED' },
];
assert.deepEqual({ ...localPending(reports, new Set(['sent']), 'a') }, { work: 15, assignment: 10 });

console.log('PASS: 245−200=45, 120 из 200 → 125, отказ → 245, офлайн, предел договора');
