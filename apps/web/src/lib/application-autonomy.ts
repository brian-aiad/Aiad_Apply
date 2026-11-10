import { currentDiscoveryEvidence } from "./discovery/current-evidence";
import {listingAgeBlocker,listingAgePriority} from './discovery/listing-age';
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { db } from "./db";
import { candidateProfile } from "./workspace-material";
import { readDiscoveryPreferences } from "./discovery/types";
import { assessOpening } from "./discovery/matching";
import { applicationDestination } from "./application-handoff";
import { applicationIdentity } from "./application-history";
import { AUTOMATION_EVENT, readAttempt, type ApplicationAttempt } from "./application-automation";
import { approvedMaterial, lockAutomation } from "./application-automation-store";
import { AUTONOMY_KEY, AUTONOMY_EXECUTION_VERSION, autonomousFitBlockers, readAutonomy, countsTowardAutonomyLimit, recoverableNativePdfFailure, unresolvedExportRisks } from "./application-autonomy-policy";

/** Called only by the selected application worker. One queue lane; no retry of parked
 * or uncertain attempts. User's standing authorization binds each exact artifact. */
export async function queueAutonomousApplication() {
 const initial=readAutonomy((await db.setting.findUnique({where:{key:AUTONOMY_KEY}}))?.value);
 if(!initial.enabled)return {queued:0,enabled:false};
 const profile=await candidateProfile();
 const evidence=await currentDiscoveryEvidence(profile);
 return db.$transaction(async tx=>{
  await lockAutomation(tx);
  const config=readAutonomy((await tx.setting.findUnique({where:{key:AUTONOMY_KEY}}))?.value);
  if(!config.enabled)return {queued:0,enabled:false};
  const start=fromZonedTime(`${formatInTimeZone(new Date(),'America/Los_Angeles','yyyy-MM-dd')}T00:00:00`,'America/Los_Angeles');
  const todaysAttempts=await tx.applicationEvent.findMany({where:{eventType:AUTOMATION_EVENT,occurredAt:{gte:start}},select:{applicationId:true,detail:true}});
  const today=new Set(todaysAttempts.filter(e=>{const a=readAttempt(e.detail);return a&&countsTowardAutonomyLimit(a);}).map(e=>e.applicationId)).size;
  if(today>=config.dailyLimit)return {queued:0,reason:'daily_limit'};
  const active=await tx.applicationEvent.findMany({where:{eventType:AUTOMATION_EVENT,toValue:{in:['QUEUED','RUNNING','SUBMITTING','UNKNOWN','SUBMITTED']}}});
  if(active.some(e=>['QUEUED','RUNNING','SUBMITTING'].includes(e.toValue||'')))return {queued:0,reason:'browser_busy'};
  const preferences=readDiscoveryPreferences((await tx.setting.findUnique({where:{key:'discovery:preferences'}}))?.value);
  const state=(await tx.setting.findUnique({where:{key:'application:autonomy-state'}}))?.value as {scanCursor?:{id?:string;updatedAt?:string}}|null;
  const cursor=state?.scanCursor;
  const cursorDate=typeof cursor?.updatedAt==='string'?new Date(cursor.updatedAt):null;
  const continuation=cursor?.id&&cursorDate&&Number.isFinite(cursorDate.getTime())?{OR:[{updatedAt:{lt:cursorDate}},{updatedAt:cursorDate,id:{lt:cursor.id}}]}:{};
  const apps=await tx.application.findMany({where:{status:{in:['REVIEW','READY']},appliedAt:null,...continuation},include:{job:true,tailoringRuns:{include:{artifacts:true},orderBy:{runNumber:'desc'}}},orderBy:[{updatedAt:'desc'},{id:'desc'}],take:100});
  // Advance a bounded window each pass; parked records cannot hide older jobs forever.
  const last=apps.at(-1);
  const scanCursor=apps.length===100&&last?{id:last.id,updatedAt:last.updatedAt.toISOString()}:null;
  const postings=await tx.discoveryPosting.findMany({where:{OR:[{approvedApplicationId:{in:apps.map(a=>a.id)}},{sourceUrl:{in:apps.flatMap(a=>[a.job.sourceUrl,a.job.applyUrl].filter((u):u is string=>!!u))}}]},orderBy:{lastSeenAt:'desc'}});
  // Fetch history once while holding the queue lock. Per-job round trips can
  // exceed the transaction deadline and starve resume/claim writes.
  const history=await tx.applicationEvent.findMany({where:{eventType:AUTOMATION_EVENT,applicationId:{in:apps.map(a=>a.id)}},orderBy:{occurredAt:'desc'}});
  const latest=new Map<string,{id:string;detail:ApplicationAttempt|null}>();
  for(const event of history)if(!latest.has(event.applicationId))latest.set(event.applicationId,{id:event.id,detail:readAttempt(event.detail)});
  const knownFor=(app:typeof apps[number])=>postings.find(p=>p.approvedApplicationId===app.id)||postings.find(p=>[app.job.sourceUrl,app.job.applyUrl].includes(p.sourceUrl));
  apps.sort((a,b)=>listingAgePriority(knownFor(a)||{postedAt:null})-listingAgePriority(knownFor(b)||{postedAt:null}));
  const reasons:Record<string,string>={};
  for(const app of apps){
   const job=app.job,run=app.tailoringRuns[0],destination=applicationDestination(job.applyUrl,job.sourceUrl);
   if(!run||!destination||run.status!=='SUCCEEDED'||run.validationPassed!==true||run.pageCount!==1)continue;
   const previous=latest.get(app.id)??null;
   // Automatic retries need a separate recovery policy; never loop blocked forms.
   const repaired = previous?.detail ? recoverableNativePdfFailure(previous.detail, run.id) : false;
   if(previous && !repaired){reasons[app.id]='Existing attempt retained; no automatic retry.';continue;}
   if(/(?:^|\.)linkedin\.com$/i.test(new URL(destination).hostname)){reasons[app.id]='LinkedIn access hold; use a verified direct employer link.';continue;}
   const known=knownFor(app);
   const ageBlocker=known&&listingAgeBlocker(known);
   if(ageBlocker){reasons[app.id]=ageBlocker;continue;}
   if(known && !known.active){reasons[app.id]='Employer listing is closed.';continue;}
   // Older captures may enter browser verification, but the worker cannot fill
   // personal data or submit until current on-page eligibility is proven.
   const fit=assessOpening({externalId:job.id,sourceKey:known?.sourceKey||'capture:local',company:job.company,title:job.title,location:known?.location||job.location||'',sourceUrl:destination,description:job.cleanDescription||job.rawPaste,employmentType:(known?.employmentType||job.employmentType) as 'Full-time',workArrangement:(known?.workArrangement||job.workArrangement) as 'On-site',salaryMin:known?.salaryMin??job.salaryMin,salaryMax:known?.salaryMax??job.salaryMax,salaryText:known?.salaryText||job.salaryText,postedAt:null},preferences,profile,evidence);
   const blockers=autonomousFitBlockers({...fit,riskCount:unresolvedExportRisks(run.reportSnapshot,run.riskCount),notes:app.notes,title:job.title});
   if(blockers.length){reasons[app.id]=blockers.join(' ');continue;}
   const identity=applicationIdentity(destination);
   if(identity&&active.some(e=>{const p=readAttempt(e.detail);return p&&applicationIdentity(p.destination)===identity;})){reasons[app.id]='Same destination already attempted.';continue;}
   const pdf=run.artifacts.find(a=>a.kind==='PDF'&&a.sha256);if(!pdf?.sha256)continue;
   const now=new Date().toISOString();
   const attempt:ApplicationAttempt={executionVersion:AUTONOMY_EXECUTION_VERSION,technicalRetryCount:repaired?(previous?.detail?.technicalRetryCount||0)+1:0,authorizationMode:'automatic',authorizationId:config.authorizationId!,prepareOnly:false,status:'QUEUED',runId:run.id,runNumber:run.runNumber,artifactId:pdf.id,resumeSha256:pdf.sha256,fileName:pdf.fileName,destination,approvedAt:now,updatedAt:now,summary:'Queued under your standing automatic-application authorization.',questions:[],unresolved:[],confirmedAnswers:[],attachmentVerified:false};
   try{await approvedMaterial(tx,app.id,attempt);}catch(e){reasons[app.id]=e instanceof Error?e.message:'Artifact check failed.';continue;}
   const event=await tx.applicationEvent.create({data:{applicationId:app.id,eventType:AUTOMATION_EVENT,toValue:'QUEUED',detail:JSON.parse(JSON.stringify(attempt))}});
   await tx.applicationEvent.create({data:{applicationId:app.id,eventType:'autonomous_application_queued',detail:{attemptId:event.id,authorizationId:config.authorizationId,runId:run.id,resumeSha256:pdf.sha256,destination}}});
   await tx.setting.upsert({where:{key:'application:autonomy-state'},create:{key:'application:autonomy-state',value:{checkedAt:now,queuedApplicationId:app.id,scanCursor,reasons}},update:{value:{checkedAt:now,queuedApplicationId:app.id,scanCursor,reasons}}});
   return {queued:1,applicationId:app.id};
  }
  await tx.setting.upsert({where:{key:'application:autonomy-state'},create:{key:'application:autonomy-state',value:{checkedAt:new Date().toISOString(),scanCursor,reasons}},update:{value:{checkedAt:new Date().toISOString(),scanCursor,reasons}}});
  return {queued:0,reason:'no_eligible_application'};
 },{timeout:30000});
}
