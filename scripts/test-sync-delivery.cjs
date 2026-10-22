const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript'),root=path.resolve(__dirname,'..');
function load(file,deps={},extra=''){
 const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports','console',code)(n=>{if(!(n in deps))throw Error('Unmocked dependency '+n);return deps[n];},m,m.exports,{log(){},warn(){},error(){},info(){}});return m.exports;
}
const delivery=load('src/lib/sync-delivery.ts');
const raw=(id,assignment='active',photo)=>({id,assignment_id:assignment,reported_quantity:2,resource_usage:'[]',photo_uri:photo||null,sync_status:'pending_sync',created_at:1,updated_at:1,_status:'created',_changed:''});
function fixture(rows,{uploadFail=false,rejectIds=[],duringPush,clearCache,other={}}={}){
 const tables={reports:rows,...other},writes=[],uploads=[],issues=[];let failPhoto=uploadFail;
 const models={};
 const model=(table,r)=>models[table+':'+r.id]||=(
  {id:r.id,_raw:r,prepareUpdate(fn){const proxy=new Proxy({}, {set(_t,key,value){const name=key==='reportSyncStatus'||key==='recordSyncStatus'?'sync_status':key;r[name]=value;r._status='updated';r._changed=name;return true;}});fn(proxy);return this;}}
 );
 const database={schema:{tables:{reports:{columns:{sync_status:{}}}}},get(table){return {
  async find(id){if(table==='work_assignments')return {isAvailable:id!=='retired'};const r=(tables[table]||[]).find(r=>r.id===id);if(!r)throw Error('missing');return model(table,r);},
  query(){return {fetchIds:async()=>(tables[table]||[]).map(r=>r.id),fetch:async()=>(tables[table]||[]).map(r=>model(table,r))};}
 };},write:async fn=>fn(),batch:async()=>{}};
 const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'test-user'}}}})},schema:()=>({from:table=>({
  async upsert(records){for(const record of Array.isArray(records)?records:[records]){if(duringPush)await duringPush(record,tables);if(rejectIds.includes(record.id))return {error:{message:'simulated rejected report'}};writes.push({table,record:structuredClone(record)});}return {error:null};},
  delete:()=>({in:async()=>({error:null})})
 })}),storage:{from:()=>({async upload(p,bytes){uploads.push({path:p,bytes:bytes.byteLength});return failPhoto?{error:{message:'network failure'}}:{data:{path:p},error:null};},getPublicUrl:p=>({data:{publicUrl:'https://photos.invalid/'+p}})})}};
 const synchronize=async opts=>{
  const changes={};for(const [table,list]of Object.entries(tables))changes[table]={created:list.filter(r=>r._status==='created').map(r=>structuredClone(r)),updated:list.filter(r=>r._status==='updated').map(r=>structuredClone(r)),deleted:[]};
  const result=await opts.pushChanges({changes});
  // The installed WatermelonDB implementation only acknowledges unchanged, non-rejected snapshots.
  for(const [table,change]of Object.entries(changes))for(const saved of [...change.created,...change.updated]){
   const current=tables[table].find(r=>r.id===saved.id);
   if(current&&JSON.stringify(current)===JSON.stringify(saved)&&!result?.experimentalRejectedIds?.[table]?.includes(saved.id)){current._status='synced';current._changed='';}
  }
 };
 const api=load('src/database/sync.ts',{
  '@nozbe/watermelondb/sync':{synchronize},'./index':{database},'@/lib/legacyWriteOffCleanup':{removeRetiredWriteOffs:async()=>{},RETIRED_WRITE_OFF_IDS:new Set()},
  '@/lib/supabase':{supabase},'@/lib/demoData':{isDemoId:()=>false,referencesDemoData:()=>false},'./assignmentPolicy':{},
  '@/lib/sync-delivery':delivery,'@/lib/report-photo':{localReportPhoto:uri=>typeof uri==='string'&&/^(file|content|blob|data):/.test(uri),reportPhotoBytes:async()=>new Uint8Array([1,2,3])},
  '@/store/syncStore':{useSyncStore:{getState:()=>({setIssues:value=>{issues.splice(0,issues.length,...value);}})}},'./safe-reset':{clearDeliveredCache:async()=>clearCache?.()}
 },'\nexport { mapToChanges };');
 return {api,tables,writes,uploads,issues,setPhotoFailure:v=>{failPhoto=v;}};
}
test('photo failure retains report and original photo; another report sends and gets acknowledged',async()=>{
 const f=fixture([raw('photo','active','file:///durable/photo.jpg'),raw('good')],{uploadFail:true});
 await assert.rejects(f.api.syncDatabase(),e=>e instanceof delivery.DeliveryError);
 assert.deepEqual(f.writes.map(w=>w.record.id),['good']);assert.equal(f.tables.reports[0].sync_status,'pending_sync');assert.equal(f.tables.reports[0].photo_uri,'file:///durable/photo.jpg');
 assert.equal(f.tables.reports[1].sync_status,'synced');assert.deepEqual(f.issues.map(i=>[i.id,i.code]),[['photo','photo']]);
 f.setPhotoFailure(false);await f.api.syncDatabase();assert.equal(f.tables.reports[0].sync_status,'synced');
 assert.equal(f.writes[1].record.photo_uri,'https://photos.invalid/reports/test-user/photo/photo.jpg');assert.equal(f.uploads[0].path,f.uploads[1].path);
});
test('a retired assignment and a server-rejected report do not block valid reports or other tables',async()=>{
 const f=fixture([raw('old','retired'),raw('denied'),raw('good')],{rejectIds:['denied'],other:{assets:[{id:'asset',_status:'created',_changed:'',name:'tool'}]}});
 await assert.rejects(f.api.syncDatabase(),e=>e.issues.length===2);
 assert.deepEqual(f.writes.map(w=>w.record.id),['good','asset']);assert.equal(f.tables.reports[0]._status,'created');assert.equal(f.tables.reports[1]._status,'created');
 assert.equal(f.tables.reports[2].sync_status,'synced');assert.deepEqual(f.issues.map(i=>i.code),['assignment','write']);
});
test('a report created during push stays pending and is sent by the next sync',async()=>{
 let added=false;const f=fixture([raw('first')],{duringPush:async(_r,tables)=>{if(!added){added=true;tables.reports.push(raw('new'));}}});
 await f.api.syncDatabase();assert.equal(f.tables.reports[0].sync_status,'synced');assert.equal(f.tables.reports[1].sync_status,'pending_sync');assert.equal(f.tables.reports[1]._status,'created');
 await f.api.syncDatabase();assert.equal(f.tables.reports[1].sync_status,'synced');assert.deepEqual(f.writes.map(w=>w.record.id),['first','new']);
});
test('a report edited while sending is not acknowledged as the newer version',async()=>{
 let edited=false;const f=fixture([raw('edited')],{duringPush:async(_r,tables)=>{if(!edited){edited=true;Object.assign(tables.reports[0],{reported_quantity:3,_status:'updated',_changed:'reported_quantity'});}}});
 await f.api.syncDatabase();assert.equal(f.tables.reports[0].sync_status,'pending_sync');await f.api.syncDatabase();assert.equal(f.tables.reports[0].sync_status,'synced');assert.deepEqual(f.writes.map(w=>w.record.reported_quantity),[2,3]);
});
test('a metadata-only acknowledgement never re-upserts the report or re-uploads its photo',async()=>{
 const f=fixture([raw('one','active','data:image/jpeg;base64,AQID')]);await f.api.syncDatabase();await f.api.syncDatabase();await f.api.syncDatabase();
 assert.equal(f.writes.length,1);assert.equal(f.uploads.length,1);assert.equal(f.tables.reports[0]._status,'synced');
});
test('saved-report result is scoped to that report even when an older queued report fails',async()=>{
 const f=fixture([raw('old','retired'),raw('own')]);await f.api.syncSavedReport('own');assert.equal(f.tables.reports[1].sync_status,'synced');
 await assert.rejects(f.api.syncSavedReport('old'),e=>e instanceof delivery.DeliveryError);
});
test('reset waits for a running sync and keeps the shared synchronization lock until completed',async()=>{
 let entered,release,reset,cleared=0;const started=new Promise(ok=>{entered=ok;}),gate=new Promise(ok=>{release=ok;});
 const f=fixture([raw('one')],{duringPush:async()=>{entered();await gate;},clearCache:async()=>{cleared++;assert.equal(f.api.syncDatabase(),reset);}});
 const first=f.api.syncDatabase();await started;reset=f.api.resetCacheSafely();assert.equal(cleared,0);assert.equal(f.api.syncDatabase(),reset);
 release();await Promise.all([first,reset]);assert.equal(cleared,1);assert.equal(f.writes.length,1);
});
test('a malformed report remains queued and does not stop the next report',async()=>{
 const bad=raw('bad');bad.resource_usage='not-json';const f=fixture([bad,raw('good')]);await assert.rejects(f.api.syncDatabase());
 assert.deepEqual(f.writes.map(w=>w.record.id),['good']);assert.equal(f.tables.reports[0].sync_status,'pending_sync');
});
test('a server snapshot has delivered status without changing the local dirty report directly',async()=>{
 const f=fixture([raw('one')]);const changes=await f.api.mapToChanges('reports',[{id:'remote',reported_quantity:2}],false);
 assert.equal(changes.created[0].sync_status,'synced');assert.equal(f.tables.reports[0].sync_status,'pending_sync');
});
test('native camera photos are copied into durable document storage before queueing',async()=>{
 const copies=[];class Directory{constructor(...parts){this.uri=parts.map(p=>p.uri||p).join('/');}create(options){assert.equal(options.idempotent,true);}}
 class File{constructor(...parts){this.uri=parts.map(p=>p.uri||p).join('/');}copy(target){copies.push([this.uri,target.uri]);}}
 const photo=load('src/lib/report-photo.ts',{'expo-file-system':{Directory,File,Paths:{document:'file:///documents'}},'react-native':{Platform:{OS:'ios'}}});
 assert.equal(await photo.preserveReportPhoto('file:///camera/cache.jpg','report-id'),'file:///documents/report-photos/report-id.jpg');assert.equal(copies.length,1);
 assert.equal(await photo.preserveReportPhoto(null,'report-id'),null);assert.equal(await photo.preserveReportPhoto('https://photos.invalid/existing.jpg','report-id'),'https://photos.invalid/existing.jpg');
});
