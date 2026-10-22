const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript'),root=path.resolve(__dirname,'..');
function load(file,deps={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',code)(n=>{if(!(n in deps))throw Error('Unmocked '+n);return deps[n];},m,m.exports);return m.exports;}
const {persistentLokiStorage,durableLokiWrites}=load('src/database/durable-loki.ts');
const {clearDeliveredCache,PendingLocalDataError}=load('src/database/safe-reset.ts',{'../lib/sync-delivery':load('src/lib/sync-delivery.ts')});
function storage(){const rows=new Map();return {rows,fail:null,async getItem(k){return rows.get(k)??null;},async setItem(k,v){if(this.fail?.(k,v))throw Error('disk full');rows.set(k,v);},async removeItem(k){rows.delete(k);}};}
const save=(a,text)=>new Promise((ok,bad)=>a.saveDatabase('test',text,e=>e?bad(e):ok()));
const read=a=>new Promise((ok,bad)=>a.loadDatabase('test',v=>v instanceof Error?bad(v):ok(v)));

test('large snapshots are chunked and recovered by a fresh adapter instance',async()=>{
 const s=storage(),text='Фото/ფოტო/şəkil'.repeat(80000),a=persistentLokiStorage(s);
 await save(a,text);assert.equal(await read(persistentLokiStorage(s)),text);
 assert([...s.rows.values()].every(v=>v.length<=180000));assert(s.rows.size>2);
});
test('UTF-8 file chunks preserve emoji at a chunk boundary',async()=>{
 const s=storage(),set=s.setItem.bind(s);s.setItem=async(k,v)=>set(k,Buffer.from(v,'utf8').toString('utf8'));
 const text='a'.repeat(179999)+'😀'+'b'.repeat(190000);await save(persistentLokiStorage(s),text);assert.equal(await read(persistentLokiStorage(s)),text);
});
test('native snapshot data uses document files, with only the atomic manifest in AsyncStorage',async()=>{
 const asyncRows=storage(),files=new Map();class Directory{constructor(...p){this.uri=p.map(v=>v.uri||v).join('/');}create(){}}
 class File{constructor(...p){this.uri=p.map(v=>v.uri||v).join('/');}get exists(){return files.has(this.uri);}async text(){return files.get(this.uri);}write(v){files.set(this.uri,v);}delete(){files.delete(this.uri);}}
 const {nativeSnapshotStorage}=load('src/database/native-file-store.ts',{'@react-native-async-storage/async-storage':{default:asyncRows,__esModule:true},'expo-file-system':{Directory,File,Paths:{document:'file:///documents'}}});
 const a=persistentLokiStorage(nativeSnapshotStorage());await save(a,'x'.repeat(250000));assert.equal(asyncRows.rows.size,1);assert([...asyncRows.rows.keys()].every(k=>k.endsWith(':manifest')));assert.equal(files.size,2);assert.equal(await read(persistentLokiStorage(nativeSnapshotStorage())),'x'.repeat(250000));
});
test('an interrupted chunk save preserves the previous complete snapshot and can be retried',async()=>{
 const s=storage(),a=persistentLokiStorage(s);await save(a,'old report');let chunks=0;
 s.fail=k=>!k.endsWith(':manifest')&&++chunks===2;await assert.rejects(save(a,'new'.repeat(100000)),/disk full/);
 assert.equal(await read(persistentLokiStorage(s)),'old report');s.fail=null;await save(a,'retry');assert.equal(await read(persistentLokiStorage(s)),'retry');
});
test('failure before manifest commit cannot replace a saved snapshot',async()=>{
 const s=storage(),a=persistentLokiStorage(s);await save(a,'old');s.fail=k=>k.endsWith(':manifest');await assert.rejects(save(a,'new'));
 assert.equal(await read(persistentLokiStorage(s)),'old');
});
test('incomplete snapshots fail closed rather than silently starting an empty database',async()=>{
 const s=storage();await save(persistentLokiStorage(s),'report');const chunk=[...s.rows.keys()].find(k=>!k.endsWith(':manifest'));s.rows.delete(chunk);
 await assert.rejects(read(persistentLokiStorage(s)),/mobile_storage_corrupt/);
});
test('write acknowledgement waits for storage and surfaces a storage failure',async()=>{
 let persist,acknowledged=false;const a={batch(_ops,cb){cb({value:undefined});},unsafeExecute(ops,cb){ops.loki({saveDatabase(fn){persist=fn;}});cb({value:undefined});},setLocal(){},removeLocal(){},destroyDeletedRecords(){},unsafeResetDatabase(){}};
 durableLokiWrites(a);let result;a.batch([],r=>{acknowledged=true;result=r;});await Promise.resolve();assert(!acknowledged);persist(Error('disk full'));await new Promise(ok=>setImmediate(ok));
 assert(acknowledged);assert.equal(result.error.message,'mobile_storage_failed');
});
test('real WatermelonDB in the Expo Go fallback restores the dirty report and photo after reopening',async()=>{
 const {Database,Model,appSchema,tableSchema}=require('@nozbe/watermelondb');
 const Loki=require('@nozbe/watermelondb/adapters/lokijs').default;
 class Report extends Model{static table='reports';}
 const schema=appSchema({version:1,tables:[tableSchema({name:'reports',columns:[{name:'photo_uri',type:'string'},{name:'reported_quantity',type:'number'},{name:'sync_status',type:'string'}]})]});
 const s=storage();const open=()=>new Database({adapter:durableLokiWrites(new Loki({dbName:'expo-go-reopen',schema,useWebWorker:false,useIncrementalIndexedDB:false,extraLokiOptions:{adapter:persistentLokiStorage(s),autosave:false}})),modelClasses:[Report]});
 const first=open();await first.write(()=>first.get('reports').create(r=>{r._raw.id='report';r._raw.photo_uri='file:///documents/report.jpg';r._raw.reported_quantity=44;r._raw.sync_status='pending_sync';}));
 const reopened=open(),r=await reopened.get('reports').find('report');assert.equal(r._raw.reported_quantity,44);assert.equal(r._raw.photo_uri,'file:///documents/report.jpg');assert.equal(r._raw._status,'created');assert.equal(r._raw.sync_status,'pending_sync');
 const fetchLocalChanges=require('@nozbe/watermelondb/sync/impl/fetchLocal').default;const changes=await fetchLocalChanges(reopened);assert.equal(changes.changes.reports.created[0].id,'report');
});

function fixture(tables,deleted={}){let destroyed=0;const rows=Object.fromEntries(Object.entries(tables).map(([table,list])=>[table,list.map((raw,i)=>({id:raw.id||String(i),_raw:raw,prepareDestroyPermanently(){return {table,id:this.id};}}))]));
 const database={write:async fn=>fn(),adapter:{getDeletedRecords:async table=>deleted[table]||[]},get:table=>({query:()=>({fetch:async()=>rows[table]||[]})}),batch:async(...ops)=>{destroyed+=ops.length;}};
 return {database,destroyed:()=>destroyed};}
for(const [name,row]of Object.entries({created:{_status:'created'},updated:{_status:'updated',_changed:'reported_quantity'},pending:{_status:'synced',sync_status:'pending_sync'},draft:{_status:'synced',sync_status:'draft'}}))test('reset blocks '+name+' reports without deleting any cached rows',async()=>{
 const f=fixture({reports:[row],contracts:[{_status:'synced'}]});await assert.rejects(clearDeliveredCache(f.database,['contracts','reports'],['reports']),e=>e instanceof PendingLocalDataError&&e.count===1);assert.equal(f.destroyed(),0);
});
test('reset protects unsent records in other tables and queued deletions',async()=>{
 const f=fixture({reports:[],assets:[{_status:'updated',_changed:'name'}]}, {reports:['deleted-report']});await assert.rejects(clearDeliveredCache(f.database,['reports','assets'],['reports','assets']),e=>e.count===2);assert.equal(f.destroyed(),0);
});
test('reset permits delivered records and metadata-only acknowledgements',async()=>{
 const f=fixture({reports:[{_status:'updated',_changed:'sync_status',sync_status:'synced'}],contracts:[{_status:'synced'}]});await clearDeliveredCache(f.database,['reports','contracts'],['reports']);assert.equal(f.destroyed(),2);
});
test('reset fails closed if the queue cannot be inspected',async()=>{
 const f=fixture({reports:[]});f.database.adapter.getDeletedRecords=async()=>{throw Error('read failure');};await assert.rejects(clearDeliveredCache(f.database,['reports'],['reports']),/read failure/);assert.equal(f.destroyed(),0);
});
