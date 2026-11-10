import 'dotenv/config';import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {assertIsolatedDatabase} from '../../src/lib/test-database';
const url=process.env.AIADAPPLY_E2E_DATABASE_URL;if(!url)throw Error('Isolated database required.');assertIsolatedDatabase(url,process.env.DATABASE_URL||'postgresql://localhost/unknown');process.env.DATABASE_URL=url;process.env.DIRECT_URL=process.env.AIADAPPLY_E2E_DIRECT_URL||url;process.env.SUPABASE_SERVICE_ROLE_KEY='';process.env.WORKER_SECRET='isolated-test-worker-secret';
test('standing queue serializes artifacts and verifies eligibility and revocation before submission',async()=>{
 const {db}=await import('../../src/lib/db');const {queueAutonomousApplication:q}=await import('../../src/lib/application-autonomy');const {POST:setting}=await import('../../src/app/api/application-autonomy/route');const {POST:worker}=await import('../../src/app/api/worker/applications/route');const {emptyApplicationProfile}=await import('../../src/lib/application-profile');const {DEFAULT_DISCOVERY_PREFERENCES}=await import('../../src/lib/discovery/types');const {CANDIDATE_PROFILE_KEY,AUTOMATION_POLICY_KEY}=await import('../../src/lib/workspace-material');
 const keys=['application:autonomy','application:autonomy-state','application-profile','application-browser:heartbeat','discovery:preferences','application:portal-methods:v1',CANDIDATE_PROFILE_KEY,AUTOMATION_POLICY_KEY];const old=await db.setting.findMany({where:{key:{in:keys}}});const ids:string[]=[];const postingIds:string[]=[];
 const settings=(enabled:boolean)=>setting(new Request('http://localhost/api/application-autonomy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,dailyLimit:5})}));
 const send=(action:string,extra:Record<string,unknown>={})=>worker(new Request('http://localhost/api/worker/applications',{method:'POST',headers:{'Content-Type':'application/json',authorization:'Bearer isolated-test-worker-secret'},body:JSON.stringify({action,workerId:'browser-integration',platform:'win32',...extra})}));
 try{
  for(const [key,value] of Object.entries({'application-profile':{...emptyApplicationProfile,firstName:'Test',lastName:'Candidate',email:'test@example.com',phone:'5551234567'},'discovery:preferences':DEFAULT_DISCOVERY_PREFERENCES,[CANDIDATE_PROFILE_KEY]:{},[AUTOMATION_POLICY_KEY]:{browserPlatform:'win32'}}))await db.setting.upsert({where:{key},create:{key,value},update:{value}});
  await settings(false);assert.equal((await q()).queued,0);await settings(true);
  const originalTransaction=db.$transaction;
  try {
   db.$transaction=(async()=>{throw new Error('private database detail');}) as typeof db.$transaction;
   const failed=await send('claim');assert.equal(failed.status,503);
   const body=await failed.json();assert.match(body.error,/queue check failed/);assert.doesNotMatch(body.error,/private database/);
  }finally{db.$transaction=originalTransaction;}

  const bytes=Buffer.from('%PDF-1.4 isolated test fixture'),sha=createHash('sha256').update(bytes).digest('hex'),label=randomUUID(),destination=`https://jobs.lever.co/integration/${label}`;const description='Required Qualifications\n2 years of technical support. Troubleshoot SaaS user incidents using SQL, Jira, Postman and REST APIs. Administer Microsoft 365 and Entra ID access, document resolutions and train users. '.repeat(3);
  const j=await db.job.create({data:{company:'Isolated Support Employer',title:'Application Support Analyst',location:'Long Beach, CA',employmentType:'Full-time',workArrangement:'On-site',salaryMin:60000,salaryMax:80000,sourceUrl:destination,rawPaste:description,cleanDescription:description,rawPasteSha256:createHash('sha256').update(label).digest('hex'),application:{create:{status:'REVIEW',tailoringRuns:{create:{status:'SUCCEEDED',validationPassed:true,pageCount:1,riskCount:0,reportSnapshot:{tailoring_mode:'evidence_only'},artifacts:{create:{kind:'PDF',fileName:'resume.pdf',sha256:sha,byteSize:bytes.length,backup:{create:{content:bytes}}}}}}}}},include:{application:true}});ids.push(j.id);
  postingIds.push(label);
  await db.discoveryPosting.create({data:{id:label,sourceKey:'employer:fixture',externalId:label,company:'Isolated Support Employer',title:'Application Support Analyst',location:'Long Beach, CA',sourceUrl:destination,description,employmentType:'Full-time',workArrangement:'On-site',salaryMin:50000,score:90,matchReasons:[],cautions:[],qualified:true,postedAt:new Date(),approvedApplicationId:j.application!.id}});
  assert.equal((await q()).queued,0,'An explicit below-floor collector salary must still exclude the job');
  await db.discoveryPosting.update({where:{id:label},data:{salaryMin:null}});
  const prior=await db.job.create({data:{company:'Historical fixture',title:'Support',rawPaste:label,rawPasteSha256:createHash('sha256').update('prior'+label).digest('hex'),application:{create:{status:'CLOSED'}}},include:{application:true}});ids.push(prior.id);
  const now=new Date().toISOString();
  for(let retry=0;retry<5;retry++)await db.applicationEvent.create({data:{applicationId:prior.application!.id,eventType:'application_automation',toValue:'BLOCKED',detail:{authorizationMode:'automatic',authorizationId:randomUUID(),status:'BLOCKED',runId:randomUUID(),runNumber:1,artifactId:randomUUID(),resumeSha256:sha,fileName:'fixture.pdf',destination:'https://jobs.lever.co/integration/historical',approvedAt:now,updatedAt:now,summary:'Historical isolated form retry',questions:[],unresolved:[],confirmedAnswers:[],attachmentVerified:false,uploadedResumeVerified:true}}});
  // Five retries of one application consume one slot, leaving room for this job.
  // A full page of newer unusable captures must not permanently hide this valid job.
  const crowded=Array.from({length:100},()=>({id:randomUUID(),appId:randomUUID()}));ids.push(...crowded.map(x=>x.id));
  await db.job.createMany({data:crowded.map(x=>({id:x.id,company:'Parked fixture',title:'Support',rawPaste:x.id,rawPasteSha256:createHash('sha256').update(x.id).digest('hex')}))});
  await db.application.createMany({data:crowded.map(x=>({id:x.appId,jobId:x.id,status:'REVIEW',updatedAt:new Date(Date.now()+1000)}))});
  const results=await Promise.all([q(),q()]);assert.equal(results.reduce((n,r)=>n+r.queued,0),1);
  const originalFindUnique=db.setting.findUnique;
  let r:Response;
  try {
   db.setting.findUnique=(async (...args:Parameters<typeof originalFindUnique>)=>{
    if(args[0]?.where?.key==='workspace:base-resume')throw new Error('Current discovery base unavailable');
    return originalFindUnique.apply(db.setting,args);
   }) as unknown as typeof originalFindUnique;
   r=await send('claim',{claimToken:randomUUID()});
  }finally{db.setting.findUnique=originalFindUnique;}
  assert.equal(r.status,200,'Existing exact-artifact queue must not depend on current discovery base');const a=await r.json();assert.equal(a.authorizationMode,'automatic');assert.equal(Buffer.from(a.resumeBase64,'base64').equals(bytes),true);const own={attemptId:a.attemptId,claimToken:a.claimToken};
  assert.equal((await send('before_submit',{...own,resumeSha256:sha,attachmentVerified:true})).status,409);
  const proof={sourceUrl:destination,evidenceText:'Job Type: Full-time\nWorksite: Long Beach, CA\nBase salary: $60,000 - $80,000 annually.',worksite:'Long Beach, CA'};
  assert.equal((await send('verify_eligibility',{...own,liveEligibility:{...proof,sourceUrl:'https://evil.example/other'}})).status,409);assert.equal((await send('verify_eligibility',{...own,liveEligibility:proof})).status,200);
  assert.equal((await send('before_submit',{...own,resumeSha256:'0'.repeat(64),attachmentVerified:true})).status,409);
  const {POST:methods}=await import('../../src/app/api/worker/application-methods/route');
  const method={version:1,employerHash:createHash('sha256').update(JSON.stringify('isolated support employer')).digest('hex'),topOrigin:'https://jobs.lever.co',frameOrigin:'https://jobs.lever.co',formHash:'c'.repeat(64),controlHash:'d'.repeat(64),method:'fill'};
  const learn=(observations?:unknown[],extra:Record<string,unknown>={})=>methods(new Request('http://localhost/api/worker/application-methods',{method:'POST',headers:{'Content-Type':'application/json',authorization:'Bearer isolated-test-worker-secret'},body:JSON.stringify({workerId:'browser-integration',attemptId:a.attemptId,claimToken:a.claimToken,observations,...extra})}));
  assert.equal((await learn([method],{claimToken:randomUUID()})).status,409);
  assert.equal((await learn([{...method,value:'private answer'}])).status,400);
  assert.equal((await learn([{...method,employerHash:'0'.repeat(64)}])).status,409);
  let learned=await learn([method]);assert.equal(learned.status,200);
  assert.equal((await learned.json()).records.some((row:{formHash:string})=>row.formHash===method.formHash),true);
  learned=await learn([{...method,failed:true}]);assert.equal(learned.status,200);
  assert.equal((await learned.json()).records.some((row:{formHash:string})=>row.formHash===method.formHash),false);
  assert.equal((await db.applicationEvent.findUniqueOrThrow({where:{id:a.attemptId}})).toValue,'RUNNING','Method telemetry must never authorize or report a submission');

  const saved=await db.applicationEvent.findUniqueOrThrow({where:{id:a.attemptId}});const detail=saved.detail as Record<string,unknown>;
  await db.applicationEvent.update({where:{id:a.attemptId},data:{toValue:'BLOCKED',detail:JSON.parse(JSON.stringify({...detail,status:'BLOCKED',summary:'Technical form issue',liveEligibility:{...proof,observedAt:new Date(Date.now()-3600000).toISOString()}}))}});
  const {POST:resume}=await import('../../src/app/api/applications/[id]/automation/route');
  const resumed=await resume(new Request('http://localhost/api/applications/'+j.application!.id+'/automation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'resume',attemptId:a.attemptId,answers:[]})}),{params:Promise.resolve({id:j.application!.id})});assert.equal(resumed.status,200);
  const b=await(await send('claim')).json();const nextOwn={attemptId:b.attemptId,claimToken:b.claimToken};assert.equal(b.liveEligibility,undefined);
  assert.equal((await send('before_submit',{...nextOwn,resumeSha256:sha,attachmentVerified:true})).status,409);
  assert.equal((await send('verify_eligibility',{...nextOwn,liveEligibility:proof})).status,200);
  await settings(false);assert.equal((await send('before_submit',{...nextOwn,resumeSha256:sha,attachmentVerified:true})).status,409);
  assert.equal(await db.application.count({where:{id:j.application!.id,appliedAt:{not:null}}}),0);
 }finally{await db.discoveryPosting.deleteMany({where:{id:{in:postingIds}}});await db.job.deleteMany({where:{id:{in:ids}}});await db.setting.deleteMany({where:{key:{in:keys}}});for(const s of old)await db.setting.create({data:{key:s.key,value:s.value!}});await db.$disconnect();}
});
