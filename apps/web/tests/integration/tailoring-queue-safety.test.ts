import 'dotenv/config';import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {assertIsolatedDatabase} from '../../src/lib/test-database';
const url=process.env.AIADAPPLY_E2E_DATABASE_URL;if(!url)throw Error('Isolated database required');assertIsolatedDatabase(url,process.env.DATABASE_URL!);process.env.DATABASE_URL=url;process.env.DIRECT_URL=process.env.AIADAPPLY_E2E_DIRECT_URL||url;
test('tailoring is serialized, preserves terminal history and cannot interrupt application submission',async()=>{
 const{db}=await import('../../src/lib/db');const{POST}=await import('../../src/app/api/applications/[id]/tailor/route');const jobs:string[]=[];
 async function fixture(status:'REVIEW'|'APPLIED'|'INTERVIEW'|'CLOSED'='REVIEW'){
  const job=await db.job.create({data:{company:'Queue fixture',title:'Support',rawPaste:'fixture',rawPasteSha256:randomUUID(),application:{create:{status,tailoringRuns:{create:{status:'FAILED'}}}}},include:{application:{include:{tailoringRuns:true}}}});jobs.push(job.id);return job.application!;
 }
 const call=(id:string,origin?:string)=>POST(new Request(`http://localhost/api/applications/${id}/tailor`,{method:'POST',headers:origin?{origin}:{}}),{params:Promise.resolve({id})});
 try{
  const blocked=await fixture();assert.equal((await call(blocked.id,'https://evil.example')).status,403);assert.equal(await db.tailoringRun.count({where:{applicationId:blocked.id}}),1);
  for(const status of ['QUEUED','RUNNING','SUBMITTING','UNKNOWN','BLOCKED']){
   const app=await fixture();await db.applicationEvent.create({data:{applicationId:app.id,eventType:'application_automation',toValue:status,detail:{status,runId:app.tailoringRuns[0].id,runNumber:1,artifactId:randomUUID(),resumeSha256:'a'.repeat(64),fileName:'fixture.pdf',destination:'https://example.com/job',approvedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),summary:'fixture',questions:[],unresolved:[],attachmentVerified:false,...(status==='BLOCKED'?{submissionStartedAt:new Date().toISOString()}:{})}}});
   assert.equal((await call(app.id)).status,409,status);assert.equal(await db.tailoringRun.count({where:{applicationId:app.id}}),1);assert.equal((await db.application.findUniqueOrThrow({where:{id:app.id}})).status,'REVIEW');assert.equal(await db.applicationEvent.count({where:{applicationId:app.id,eventType:'tailoring_queued'}}),0);
  }
  const concurrent=await fixture();const results=await Promise.all(Array.from({length:4},()=>call(concurrent.id)));assert.deepEqual(results.map(r=>r.status).sort(),[200,200,200,201]);assert.equal(await db.tailoringRun.count({where:{applicationId:concurrent.id}}),2);
  for(const status of ['APPLIED','INTERVIEW','CLOSED'] as const){const app=await fixture(status);assert.equal((await call(app.id)).status,201);assert.equal((await db.application.findUniqueOrThrow({where:{id:app.id}})).status,status);}
 }finally{await db.job.deleteMany({where:{id:{in:jobs}}});await db.$disconnect();}
});
