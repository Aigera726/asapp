const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(!(n in deps))throw Error('Unmocked '+n);return deps[n];},m,m.exports);return m.exports;}
const {connectAuthSession,observeSessionNotice,HANDLED_SESSION_LOGS}=load('src/lib/auth-connection.ts');
function fixture(result){let active=true,listener,event;const calls=[],sessions=[],notices=[];const client={auth:{getSession:async()=>typeof result==='function'?result():result,onAuthStateChange(fn){event=fn;calls.push('listen');return {data:{subscription:{unsubscribe(){calls.push('unsubscribe');}}}};},startAutoRefresh:async()=>{calls.push('start');},stopAutoRefresh:async()=>{calls.push('stop');}}};
 const connection=connectAuthSession(client,{session:s=>sessions.push(s),notice:n=>notices.push(n)},{isActive:()=>active,subscribe:fn=>{listener=fn;return()=>calls.push('unlisten');}});
 return {connection,calls,sessions,notices,change:value=>{active=value;listener(value);},event:(e,s)=>event(e,s)};
}
test('a revoked refresh token returns a friendly sign-in state and keeps normal refresh available',async()=>{
 const f=fixture({data:{session:null},error:{code:'refresh_token_not_found',message:'Invalid Refresh Token'}});await f.connection.ready;assert.equal(f.sessions[0],null);assert.equal(f.notices[0],'expired');assert.deepEqual(f.calls,['listen','start']);f.connection.dispose();
});
test('successful restore, background/foreground refresh and later sign-in remain connected',async()=>{
 const session={user:{id:'u'}};const f=fixture({data:{session},error:null});await f.connection.ready;assert.equal(f.sessions[0],session);f.change(false);f.change(true);assert.deepEqual(f.calls,['listen','start','stop','start']);
 f.event('TOKEN_REFRESHED',{user:{id:'u2'}});assert.equal(f.sessions.at(-1).user.id,'u2');assert.equal(f.notices.at(-1),null);f.connection.dispose();assert(f.calls.includes('unsubscribe'));
});
test('a network failure has a retryable explanation rather than an unhandled rejection',async()=>{
 const f=fixture(()=>{throw Error('network down');});await f.connection.ready;assert.equal(f.notices[0],'restoreFailed');assert.equal(f.sessions[0],null);f.connection.dispose();
});
test('a disposed connection cannot restore an old session or start its refresh timer',async()=>{
 let finish;const pending=new Promise(ok=>{finish=ok;});const f=fixture(()=>pending);f.connection.dispose();finish({data:{session:{user:{id:'old'}}},error:null});await f.connection.ready;assert.equal(f.sessions.length,0);assert(!f.calls.includes('start'));
});
test('real SDK expiry before the UI mounts preserves a friendly notice and the outbox',async()=>{
 const rows=new Map(),key='test-revoked-'+Date.now();rows.set(key,JSON.stringify({access_token:'expired-test-token',refresh_token:'already-revoked',expires_at:Math.floor(Date.now()/1000)-600,expires_in:3600,token_type:'bearer',user:{id:'00000000-0000-4000-8000-000000000001'}}));rows.set('pending-reports','report-with-photo');
 const storage={getItem:async k=>rows.get(k)||null,setItem:async(k,v)=>{rows.set(k,v);},removeItem:async k=>{rows.delete(k);}};
 let options;load('src/lib/supabase.ts',{'react-native-url-polyfill/auto':{},'@react-native-async-storage/async-storage':{default:storage},'@supabase/supabase-js':{createClient:(_u,_k,o)=>{options=o;return {};}},'./auth-connection':{observeSessionNotice:()=>({unsubscribe(){}})},'@/store/sessionNoticeStore':{}});assert.equal(options.auth.autoRefreshToken,false);
 const {createClient}=require('@supabase/supabase-js');const notices=[],sessions=[],errors=[];let requests=0;
 const oldError=console.error;console.error=(...a)=>errors.push(a);
 let connection,client,observer;
 try{
  client=createClient('http://127.0.0.1:29999','test-anon',{auth:{...options.auth,storage,storageKey:key},global:{fetch:async url=>{requests++;assert(String(url).includes('/auth/v1/token'));return new Response(JSON.stringify({code:'refresh_token_not_found',message:'Invalid Refresh Token: Refresh Token Not Found'}),{status:400,headers:{'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'}});}}});
  observer=observeSessionNotice(client,n=>notices.push(n));await client.auth.initialize();await new Promise(ok=>setTimeout(ok,20));
  connection=connectAuthSession(client,{session:s=>sessions.push(s),notice:n=>notices.push(n)},{isActive:()=>true,subscribe:()=>()=>{}});await connection.ready;await new Promise(ok=>setImmediate(ok));
  assert.equal(notices.at(-1),'expired');assert.equal(sessions[0],null);assert.equal(rows.get('pending-reports'),'report-with-photo');assert.equal(requests,1);
  assert(errors.length>0);assert(errors.every(args=>HANDLED_SESSION_LOGS.some(pattern=>pattern.test(args[0]?.message||''))));
  assert(!HANDLED_SESSION_LOGS.some(pattern=>pattern.test('Database corruption')));assert(!HANDLED_SESSION_LOGS.some(pattern=>pattern.test('Invalid login credentials')));
 }finally{connection?.dispose();observer?.unsubscribe();if(client)await client.auth.stopAutoRefresh();console.error=oldError;}
});
