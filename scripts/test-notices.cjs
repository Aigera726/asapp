// Уведомления мобилки: ДС к договорам и решения по объёмам; разовое окно «ДС согласовано».
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(file) {
  const resolved = path.resolve(root, file);
  if (resolved.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (cache.has(resolved)) return cache.get(resolved);
  const exports = {};
  cache.set(resolved, exports);
  const req = name => {
    if (name.startsWith('@/')) name = path.relative(path.dirname(resolved), path.resolve(root, 'src', name.slice(2)));
    const target = path.resolve(path.dirname(resolved), /\.(json|ts)$/.test(name) ? name : name + '.ts');
    return load(path.relative(root, target));
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, require: req, Intl });
  return exports;
}
const { buildNotices, initialSeen, approvedToShow, blockedWorks } = load('src/lib/notices.ts');
const { noticeTitle, noticeBody } = load('src/i18n/notices.ts');
// Массивы из vm-контекста сравниваем как данные.
const plain = v => JSON.parse(JSON.stringify(v));

const now = Date.parse('2026-11-10T12:00:00Z');
const ago = days => new Date(now - days * 86400000);
const change = (o = {}) => ({ assignment_id: 'a1', work_name: 'Кладка', unit: 'м²', change: 'INCREASE', added: false, old_quantity: 34, new_quantity: 40, ...o });
const addendum = (o = {}) => ({ id: 'd1', status: 'APPROVED', number: 3, contractNumber: '145', projectName: 'Тестовый проект', objectName: 'Блок 1',
  submittedAt: ago(1), decidedAt: ago(0.5), decisionComment: null, changes: [change(), change({ assignment_id: null, added: true, work_name: 'Бетон', old_quantity: 0, new_quantity: 3 })], ...o });

test('addenda and decided reports become notices, newest first; a status change is a new notice; older than 30 days is dropped', () => {
  const reports = [
    { id: 'r1', status: 'approved', estimateWorkId: 'w1', unit: 'м²', reportedVolume: 6, confirmedVolume: 5, decidedAt: ago(0.2), decidedByName: 'Аня', rejectionReason: null },
    { id: 'r2', status: 'pending_approval', estimateWorkId: 'w1', unit: 'м²', reportedVolume: 1, confirmedVolume: null, decidedAt: null, decidedByName: null, rejectionReason: null },
    { id: 'r3', status: 'rejected', estimateWorkId: 'w1', unit: 'м²', reportedVolume: 2, confirmedVolume: null, decidedAt: ago(40), decidedByName: 'Аня', rejectionReason: 'нет' },
  ];
  const list = buildNotices([addendum(), addendum({ id: 'd2', status: 'PENDING_APPROVAL', number: 4, submittedAt: ago(0.1), decidedAt: null })],
    reports, new Map([['w1', 'Кладка стен']]), now);
  assert.deepEqual(plain(list.map(n => n.id)), ['ad:d2:PENDING_APPROVAL', 'rep:r1:approved', 'ad:d1:APPROVED']);
  assert.deepEqual(plain(blockedWorks(list[0])), ['Кладка']);
  assert.equal(noticeTitle(list[0], 'ru'), 'ДС № 4 к договору № 145 на согласовании');
  assert.match(noticeBody(list[0], 'ru'), /не принимается: Кладка\./);
  assert.match(noticeBody(list[1], 'ru'), /^Кладка стен: подтверждено 5 из 6/);
  const approved = noticeBody(list[2], 'ru');
  assert.match(approved, /Тестовый проект · Блок 1/);
  assert.match(approved, /Кладка: 34 → 40/);
  assert.match(approved, /Новая работа: Бетон — 3/);
  for (const lang of ['en', 'ka', 'az']) for (const n of list) assert.doesNotMatch(noticeTitle(n, lang) + noticeBody(n, lang), /\{|undefined/);
});

test('first run marks old notices seen; the approved window shows each addendum once, oldest first', () => {
  const list = buildNotices([addendum({ id: 'old', decidedAt: ago(10) }), addendum({ id: 'new', decidedAt: ago(1) }),
    addendum({ id: 'rej', status: 'REJECTED', decidedAt: ago(1), decisionComment: 'дорого' })], [], new Map(), now);
  assert.deepEqual(plain(initialSeen(list, now)), ['ad:old:APPROVED']);
  assert.deepEqual(plain(approvedToShow(list, new Set(['old'])).map(n => n.addendumId)), ['new']);
  assert.equal(noticeBody(list.find(n => n.addendumId === 'rej'), 'ru'), 'Тестовый проект · Блок 1\nПричина: дорого. Объём по работам снова принимается.');
});
