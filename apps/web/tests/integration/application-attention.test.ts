import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assertIsolatedDatabase} from '../../src/lib/test-database';
const url=process.env.AIADAPPLY_E2E_DATABASE_URL;
if(!url)throw Error('Isolated database required');
assertIsolatedDatabase(url,process.env.DATABASE_URL||'postgresql://localhost/unknown');
process.env.DATABASE_URL=url;process.env.DIRECT_URL=process.env.AIADAPPLY_E2E_DIRECT_URL||url;
test('attention sees older unknown beyond next-action cap and ignores superseded blockers',async()=>{
 const {db}=await import('../../src/lib/db');
 const {getDashboard,getApplications}=await import('../../src/lib/queries');
 const ids:string[]=[];
 try{
  const create=async(status:'REVIEW'|'APPLIED',priority=0)=>{
   const id=randomUUID();ids.push(id);
   return db.job.create({data:{id,company:'Attention QA',title:'Support',rawPaste:'Isolated fixture',rawPasteSha256:id,application:{create:{status,priority}}},include:{application:true}});
  };
  const unknown=await create('REVIEW');
  await db.applicationEvent.create({data:{applicationId:unknown.application!.id,eventType:'application_automation',toValue:'UNKNOWN'}});
  for(let i=0;i<51;i++)await create('REVIEW',10);
  const active=await create('REVIEW');
  await db.applicationEvent.create({data:{applicationId:active.application!.id,eventType:'application_automation',toValue:'BLOCKED',occurredAt:new Date(Date.now()-60000)}});
  await db.applicationEvent.create({data:{applicationId:active.application!.id,eventType:'application_automation',toValue:'RUNNING'}});
  const applied=await create('APPLIED');
  await db.applicationEvent.create({data:{applicationId:applied.application!.id,eventType:'application_automation',toValue:'BLOCKED'}});
  const dashboard=await getDashboard();
  assert.ok(dashboard.needsAttention.some(row=>row.id===unknown.application!.id&&row.group==='UNKNOWN'));
  assert.ok(!dashboard.needsAttention.some(row=>[active.application!.id,applied.application!.id].includes(row.id)));
  const applications=await getApplications();
  assert.equal(applications.find(row=>row.id===active.application!.id)?.automationGroup,'ACTIVE');
  assert.equal(applications.find(row=>row.id===applied.application!.id)?.automationGroup,null);
 }finally{await db.job.deleteMany({where:{id:{in:ids}}});await db.$disconnect();}
});
