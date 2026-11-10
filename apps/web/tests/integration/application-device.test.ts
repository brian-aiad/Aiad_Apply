import 'dotenv/config';import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {assertIsolatedDatabase} from '../../src/lib/test-database';
const url=process.env.AIADAPPLY_E2E_DATABASE_URL;if(!url)throw Error('Isolated database required.');assertIsolatedDatabase(url,process.env.DATABASE_URL||'postgresql://localhost/unknown');process.env.DATABASE_URL=url;process.env.DIRECT_URL=process.env.AIADAPPLY_E2E_DIRECT_URL||url;process.env.WORKER_SECRET='device-test-secret';
test('device handoff preserves discovery and cannot race an active application',async()=>{
 const {db}=await import('../../src/lib/db');const {POST,GET}=await import('../../src/app/api/application-device/route');const {POST:worker}=await import('../../src/app/api/worker/applications/route');const {AUTOMATION_POLICY_KEY:key}=await import('../../src/lib/workspace-material');
 const old=await db.setting.findUnique({where:{key}});let jobId:string|undefined;
 const select=(platform:string)=>POST(new Request('http://localhost/api/application-device',{method:'POST',body:JSON.stringify({platform})}));
 try{
 await db.setting.upsert({where:{key},create:{key,value:{browserPlatform:'win32',extra:'preserved'}},update:{value:{browserPlatform:'win32',extra:'preserved'}}});
 assert.equal((await select('darwin')).status,200);assert.equal((await(await GET()).json()).discovery,'win32');
 assert.equal(((await db.setting.findUnique({where:{key}}))!.value as Record<string,unknown>).extra,'preserved');
 assert.equal((await worker(new Request('http://localhost/api/worker/applications',{method:'POST',headers:{authorization:'Bearer device-test-secret'},body:JSON.stringify({action:'claim',platform:'win32',workerId:'browser-device-test'})}))).status,204);
 const j=await db.job.create({data:{company:'Fixture',title:'Support',rawPaste:'Fixture',rawPasteSha256:randomUUID(),application:{create:{events:{create:{eventType:'application_automation',toValue:'RUNNING',detail:{}}}}}},include:{application:{include:{events:true}}}});jobId=j.id;
 assert.equal((await select('win32')).status,409);
 await db.applicationEvent.update({where:{id:j.application!.events[0].id},data:{toValue:'SUBMITTING'}});assert.equal((await select('win32')).status,409);
 await db.applicationEvent.update({where:{id:j.application!.events[0].id},data:{toValue:'UNKNOWN'}});assert.equal((await select('win32')).status,200);
 assert.equal((await select('invalid')).status,400);
 assert.equal((await POST(new Request('http://localhost/api/application-device',{method:'POST',headers:{origin:'https://untrusted.example'},body:JSON.stringify({platform:'darwin'})}))).status,403);
 }finally{if(jobId)await db.job.delete({where:{id:jobId}});await db.setting.deleteMany({where:{key}});if(old)await db.setting.create({data:{key,value:old.value!}});await db.$disconnect();}
});
