// Отказы сервера по отчётам: какие ошибки — отказ (отчёт перестаёт резервировать объём), какие — обрыв связи;
// ДС на согласовании по заданию.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript'),root=path.resolve(__dirname,'..');
const m={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/report-refusals.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({}),m,m.exports);
const {refusalOf,mergeRefusals,blockingAddendum}=m.exports;
const issue=(o)=>({table:'reports',id:'r1',code:'write',...o});

test('server refusal vs lost connection',()=>{
  assert.equal(refusalOf(issue({serverCode:'P0001',detail:'Объём 12 больше доступного 5: план 20, подтверждено 15'})),'overLimit');
  assert.equal(refusalOf(issue({serverCode:'42501',detail:'new row violates row-level security policy'})),'write');
  assert.equal(refusalOf(issue({detail:'TypeError: Network request failed'})),null,'no server code — connection, the report will be sent again');
  assert.equal(refusalOf(issue({code:'addendum'})),'addendum');
  assert.equal(refusalOf(issue({code:'assignment'})),'assignment');
  assert.equal(refusalOf(issue({code:'photo'})),null);
  assert.equal(refusalOf(issue({table:'purchase_requests',serverCode:'P0001'})),null);
});

test('refusals of a new push add to the saved ones; a connection error keeps the earlier refusal',()=>{
  const prev={r1:{code:'overLimit',detail:'x',at:1}};
  const next=mergeRefusals(prev,[issue({detail:'fetch failed'}),issue({id:'r2',code:'addendum'})],5);
  assert.deepEqual(Object.keys(next).sort(),['r1','r2']);
  assert.equal(next.r1.code,'overLimit'); assert.equal(next.r2.at,5);
});

test('a pending addendum that changes the assignment volume blocks entering it; approved ones do not',()=>{
  const list=[{status:'APPROVED',number:1,changes:[{assignment_id:'a'}]},{status:'PENDING_APPROVAL',number:2,changes:[{assignment_id:'b'},{assignment_id:null}]}];
  assert.equal(blockingAddendum(list,'a'),null);
  assert.equal(blockingAddendum(list,'b').number,2);
});
