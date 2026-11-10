import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertIsolatedDatabase} from '../../src/lib/test-database';
const url=process.env.AIADAPPLY_E2E_DATABASE_URL;
if(!url)throw Error('Isolated database required');
assertIsolatedDatabase(url,process.env.DATABASE_URL||'postgresql://localhost/unknown');
process.env.DATABASE_URL=url;process.env.DIRECT_URL=process.env.AIADAPPLY_E2E_DIRECT_URL||url;
test('dashboard observation cannot collect and manual requests deduplicate for desktop',async()=>{
 const {db}=await import('../../src/lib/db');
 const {POST}=await import('../../src/app/api/discovery/refresh/route');
 const {REFRESH_REQUEST_KEY,completeDesktopRefresh}=await import('../../src/lib/discovery/refresh-request');
 const originalPolicy=await db.setting.findUnique({where:{key:'workspace:automation'}});
 const originalSecret=process.env.WORKER_SECRET;
 const original=await db.setting.findUnique({where:{key:REFRESH_REQUEST_KEY}});
 const before=await db.setting.findUnique({where:{key:'discovery:last-scan'}});
 try{
  await db.setting.deleteMany({where:{key:REFRESH_REQUEST_KEY}});
  const req=(force:boolean)=>new Request('http://localhost/api/discovery/refresh',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({force})});
  assert.equal((await (await POST(req(false))).json()).reason,'observe_only');
  assert.equal(await db.setting.findUnique({where:{key:REFRESH_REQUEST_KEY}}),null);
  const results=await Promise.all(Array.from({length:5},async()=>{const response=await POST(req(true));assert.equal(response.status,202);return response.json();}));
  assert.equal(new Set(results.map(x=>x.request.id)).size,1);
  assert.deepEqual(await db.setting.findUnique({where:{key:'discovery:last-scan'}}),before);
  await completeDesktopRefresh({id:'stale',requestedAt:new Date().toISOString()});
  assert.ok(await db.setting.findUnique({where:{key:REFRESH_REQUEST_KEY}}));
  await completeDesktopRefresh(results[0].request);
  assert.equal(await db.setting.findUnique({where:{key:REFRESH_REQUEST_KEY}}),null);
  await db.setting.upsert({where:{key:'workspace:automation'},create:{key:'workspace:automation',value:{browserPlatform:process.platform}},update:{value:{browserPlatform:process.platform}}});
  process.env.WORKER_SECRET='isolated-worker-fixture';
  const {POST:workerPost}=await import('../../src/app/api/worker/discovery/route');
  const idle=await workerPost(new Request('http://localhost/api/worker/discovery',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer isolated-worker-fixture'},body:JSON.stringify({pendingOnly:true})}));
  assert.equal(idle.status,200);assert.equal((await idle.json()).status,'idle');
  assert.deepEqual(await db.setting.findUnique({where:{key:'discovery:last-scan'}}),before);
 }finally{
  if(originalSecret===undefined)delete process.env.WORKER_SECRET;else process.env.WORKER_SECRET=originalSecret;
  await db.setting.deleteMany({where:{key:'workspace:automation'}});
  if(originalPolicy)await db.setting.create({data:{key:originalPolicy.key,value:originalPolicy.value!}});
  await db.setting.deleteMany({where:{key:REFRESH_REQUEST_KEY}});
  if(original)await db.setting.create({data:{key:original.key,value:original.value!}});
  await db.$disconnect();
 }
});
