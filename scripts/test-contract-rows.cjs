// Вкладка «Работы»: работы сгруппированы по договорам, у свёрнутого договора — только заголовок.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript'),root=path.resolve(__dirname,'..');
const m={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/contract-rows.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({}),m,m.exports);
const {contractRows}=m.exports;
const w=(id,c,extra={})=>({id,contract_id:c,contract_number:'N-'+c,contractor_name:'K-'+c,...extra});
test('works are grouped under their contract head in the order of first appearance',()=>{
  const rows=contractRows([w('a','1',{contract_amount:1000,contract_currency:'₾',contract_start:'2026-11-01'}),w('b','2'),w('c','1')],new Set());
  assert.deepEqual(rows.map(r=>r.kind==='contract'?`H${r.contract_id}:${r.count}`:r.id),['H1:2','a','c','H2:1','b']);
  assert.deepEqual([rows[0].amount,rows[0].currency,rows[0].start,rows[0].end,rows[0].number,rows[0].contractor],[1000,'₾','2026-11-01',null,'N-1','K-1']);
});
test('a collapsed contract shows only its head',()=>{
  const rows=contractRows([w('a','1'),w('b','2')],new Set(['1']));
  assert.deepEqual(rows.map(r=>r.kind==='contract'?`H${r.contract_id}${r.collapsed?'-':'+'}`:r.id),['H1-','H2+','b']);
});
