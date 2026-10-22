const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const modulePath=process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite';
test('photo SQL is rerunnable, restricts uploads to a linked user folder, and preserves other buckets',async()=>{
 const {PGlite}=require(modulePath),db=new PGlite();
 try{
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA storage; CREATE SCHEMA mobile; CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE FUNCTION mobile.my_contractor_ids() RETURNS SETOF uuid LANGUAGE sql STABLE AS $$ SELECT '${id(20)}'::uuid WHERE current_setting('test.linked',true)='yes' $$;
   CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
   CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text UNIQUE,owner_id text DEFAULT auth.uid()::text);
   ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
   INSERT INTO storage.buckets VALUES('existing-private','existing-private',false,1,ARRAY['application/pdf']);
   GRANT USAGE ON SCHEMA auth,mobile TO authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth,mobile,storage TO authenticated;`);
  const sql=fs.readFileSync(path.join(__dirname,'../sql/usp/report_photo_storage.sql'),'utf8');await db.exec(sql);await db.exec(sql);
  const scalar=async q=>Object.values((await db.query(q)).rows[0])[0];
  assert.equal(await scalar("SELECT public FROM storage.buckets WHERE id='existing-private'"),false);
  assert.equal(await scalar("SELECT public FROM storage.buckets WHERE id='report-photos'"),true);
  assert.equal(await scalar("SELECT file_size_limit::int FROM storage.buckets WHERE id='report-photos'"),10485760);
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id(1)}',false); SELECT set_config('test.linked','yes',false);`);
  const own=`reports/${id(1)}/${id(2)}/photo.jpg`,other=`reports/${id(3)}/${id(2)}/photo.jpg`;
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('report-photos',$1)",[own]);
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('report-photos',$1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name",[own]);
  // Keep the old mobile version able to send its queued photo before an application reload.
  const legacy=`reports/${id(8)}/photo.jpg`;
  await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('report-photos',$1)",[legacy]);
  await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('report-photos',$1)",[other]),/row-level security/);
  await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('existing-private',$1)",[own]),/row-level security/);
  await db.exec("SELECT set_config('test.linked','no',false)");
  await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('report-photos',$1)",[`reports/${id(1)}/${id(5)}/photo.jpg`]),/row-level security/);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${id(3)}',false)`);
  assert.equal(await scalar('SELECT count(*)::int FROM storage.objects'),0);
  await db.exec("SELECT set_config('test.linked','yes',false)");
  await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('report-photos',$1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name",[legacy]),/row-level security/);
  await db.exec('RESET ROLE; SET ROLE anon');await assert.rejects(db.query('SELECT * FROM storage.objects'),/permission denied/);
 }finally{await db.close();}
});
test('photo SQL refuses to make an existing private report bucket public',async()=>{
 const {PGlite}=require(modulePath),db=new PGlite();try{
  await db.exec("CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean); INSERT INTO storage.buckets VALUES('report-photos',false)");
  await assert.rejects(db.exec(fs.readFileSync(path.join(__dirname,'../sql/usp/report_photo_storage.sql'),'utf8')),/приватное/);
  await db.exec('ROLLBACK');assert.equal((await db.query('SELECT public FROM storage.buckets')).rows[0].public,false);
 }finally{await db.close();}
});
