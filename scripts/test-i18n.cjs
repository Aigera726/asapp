const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const { createStore } = require('zustand/vanilla');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(file) {
  const resolved = path.resolve(root, file);
  if (resolved.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (cache.has(resolved)) return cache.get(resolved);
  const exports = {};
  cache.set(resolved, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, require: name => load(path.relative(root,
    path.resolve(path.dirname(resolved), /\.(json|ts)$/.test(name) ? name : name + '.ts'))) });
  return exports;
}
const { LANGUAGES, dictionaries, translate, authError } = load('src/i18n/messages.ts');
const { createLanguageState, LANGUAGE_STORAGE_KEY } = load('src/i18n/language-state.ts');
const { displayQty, displayDate, unitLabel, demoName, reportError, REPORT_STATUS, WORK_STATUS } = load('src/i18n/work.ts');
const { indexAssignmentTexts, localizedValue } = load('src/lib/assignment-texts.ts');
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test('all languages cover every message and preserve substitution parameters', () => {
  const keys = Object.keys(dictionaries.ru).sort();
  for (const { code } of LANGUAGES) {
    assert.deepEqual(Object.keys(dictionaries[code]).sort(), keys);
    for (const key of keys) {
      assert.ok(dictionaries[code][key].trim(), `${code}: ${key}`);
      assert.deepEqual(placeholders(dictionaries[code][key]), placeholders(dictionaries.ru[key]), `${code}: ${key}`);
      if (code !== 'ru') assert.doesNotMatch(dictionaries[code][key], /[А-Яа-яЁё]/, `${code}: ${key}`);
    }
  }
});
test('user names and company names remain exactly as entered in every language', () => {
  for (const { code } of LANGUAGES) {
    assert.ok(translate(code, 'home.greeting', { name: 'Айгерим <3' }).includes('Айгерим <3'));
    assert.ok(translate(code, 'onboarding.pendingCompany', { company: 'Borjomi $&' }).includes('Borjomi $&'));
    assert.ok(translate(code, 'home.assignmentCount', { count: 0 }).includes('0'));
  }
});
test('known sign-in and registration failures use the selected language and unknown reasons remain visible', () => {
  for (const { code } of LANGUAGES) {
    assert.equal(authError('Invalid login credentials', code), translate(code, 'errors.credentials'));
    assert.equal(authError('User already registered', code), translate(code, 'errors.emailExists'));
    assert.equal(authError('Сервер регистрации недоступен (502)', code), translate(code, 'errors.network'));
    assert.equal(authError('ID контрагента должен быть UUID из карточки договора', code), translate(code, 'errors.contractorId'));
    assert.equal(authError('Specific service reason 123', code), 'Specific service reason 123');
  }
});
test('language survives a new app instance without any auth session', async () => {
  const data = new Map();
  const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => { data.set(key, value); } };
  const first = createStore(createLanguageState(storage));
  await first.getState().loadLanguage();
  await first.getState().setLanguage('az');
  const restarted = createStore(createLanguageState(storage));
  await restarted.getState().loadLanguage();
  assert.equal(restarted.getState().language, 'az');
  assert.equal(restarted.getState().isLoaded, true);
  assert.equal(data.get(LANGUAGE_STORAGE_KEY), 'az');
});
test('a late storage read cannot undo a language selected during hydration', async () => {
  let finishRead;
  const store = createStore(createLanguageState({ getItem: () => new Promise(resolve => { finishRead = resolve; }), setItem: async () => {} }));
  const loading = store.getState().loadLanguage();
  const duplicate = store.getState().loadLanguage();
  assert.equal(loading, duplicate);
  await store.getState().setLanguage('ka');
  finishRead('en');
  await loading;
  assert.equal(store.getState().language, 'ka');
});
test('rapid changes persist in order, and the most recent selection wins', async () => {
  const saved = [];
  const store = createStore(createLanguageState({ getItem: async () => null, setItem: async (_key, value) => { await new Promise(resolve => setTimeout(resolve, 5)); saved.push(value); } }));
  await Promise.all(['en', 'ka', 'az'].map(language => store.getState().setLanguage(language)));
  assert.equal(saved.join(','), 'en,ka,az');
  assert.equal(store.getState().language, 'az');
});
test('corrupt or unavailable storage never prevents app startup; saving can recover', async () => {
  const corrupt = createStore(createLanguageState({ getItem: async () => 'unknown', setItem: async () => {} }));
  await corrupt.getState().loadLanguage();
  assert.equal(corrupt.getState().language, 'ru');
  let fail = true;
  const store = createStore(createLanguageState({ getItem: async () => { throw Error('unavailable'); }, setItem: async () => { if (fail) throw Error('full'); } }));
  await store.getState().loadLanguage();
  assert.equal(store.getState().isLoaded, true);
  await store.getState().setLanguage('en');
  assert.equal(store.getState().language, 'en');
  assert.equal(store.getState().storageError, true);
  fail = false;
  await store.getState().setLanguage('az');
  assert.equal(store.getState().storageError, false);
});
test('translated screens have no untranslated Russian labels or missing literal translation keys', () => {
  const parser = require('@babel/parser');
  const files = ['src/components/AuthLayout.tsx', 'src/components/LanguageSelector.tsx', 'src/components/ServerStatusBar.tsx',
    'src/screens/auth/LoginScreen.tsx', 'src/screens/auth/RegisterScreen.tsx', 'src/screens/auth/OnboardingScreen.tsx',
    'src/screens/auth/ConnectionSetupScreen.tsx', 'src/screens/app/DashboardScreen.tsx',
    'src/screens/app/TasksScreen.tsx', 'src/screens/app/ReportFormScreen.tsx', 'src/components/VolumeBar.tsx'];
  const check = (node, file) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXText') assert.doesNotMatch(node.value, /[А-Яа-яЁё]/, file);
    if (node.type === 'JSXAttribute' && node.value?.type === 'StringLiteral' && /label|title|placeholder/i.test(node.name.name))
      assert.doesNotMatch(node.value.value, /[А-Яа-яЁё]/, file + ': ' + node.name.name);
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 't' && node.arguments[0]?.type === 'StringLiteral')
      assert.ok(Object.hasOwn(dictionaries.ru, node.arguments[0].value), file + ': ' + node.arguments[0].value);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(child => check(child, file));
      else if (value && typeof value === 'object' && value.type) check(value, file);
    }
  };
  for (const file of files) check(parser.parse(fs.readFileSync(path.join(root, file), 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program, file);
});
test('work and report states, units, dates and quantities follow the selected language', () => {
  for (const { code } of LANGUAGES) {
    for (const key of [...Object.values(REPORT_STATUS), ...Object.values(WORK_STATUS)]) assert.ok(dictionaries[code][key]);
    assert.equal(unitLabel('м³', code), dictionaries[code]['units.m3']);
    assert.equal(unitLabel('MAN_HOUR', code), dictionaries[code]['units.manHour']);
    assert.equal(unitLabel('custom-unit', code), 'custom-unit');
    assert.equal(displayDate(null, code), '—');
    assert.ok(displayDate(new Date('2026-10-19T12:30:00Z'), code).includes('2026'));
    assert.equal(reportError('Нет доступной работы фактической сметы. Обновите данные.', code), dictionaries[code]['report.unavailable']);
  }
  assert.equal(displayQty(2.5, 'en'), '2.5');
  assert.equal(displayQty(2.5, 'ru'), '2,5');
  assert.equal(demoName('Устройство монолитной плиты перекрытия (демо)', 'az'), dictionaries.az['demo.slab']);
  assert.equal(demoName('User-defined work name', 'az'), 'User-defined work name');
});
test('catalogue translations keep work and resource identities separate and use an honest fallback', () => {
  const rows = [{id:'a:work',assignment_id:'a',entity_kind:'work',entity_id:'w',names:{en:'Concrete work'},units:{en:'m³'}},
    {id:'a:resource:r',assignment_id:'a',entity_kind:'resource',entity_id:'r',names:{az:'Beton'},units:{az:'m³'}}];
  const indexed=indexAssignmentTexts(rows);
  assert.equal(indexed.works.a.entity_id,'w');assert.equal(indexed.resources.r.names.az,'Beton');
  assert.equal(localizedValue(indexed.works.a.names,'en','Original'),'Concrete work');
  assert.equal(localizedValue(indexed.works.a.names,'ka','Original'),'Original');
  assert.equal(localizedValue({ka:'  '},'ka','Original'),'Original');
  assert.equal(localizedValue({ka:100},'ka','Original'),'Original');
  assert.equal(indexAssignmentTexts([null,{}]).works.a,undefined);
});
