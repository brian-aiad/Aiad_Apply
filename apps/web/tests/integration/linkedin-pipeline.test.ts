import "dotenv/config";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { assertIsolatedDatabase } from "../../src/lib/test-database";
const testUrl=process.env.AIADAPPLY_E2E_DATABASE_URL;
if(!testUrl) throw new Error("Isolated database required");
assertIsolatedDatabase(testUrl,process.env.DATABASE_URL!);
process.env.DATABASE_URL=testUrl;process.env.DIRECT_URL=process.env.AIADAPPLY_E2E_DIRECT_URL||testUrl;
let db:PrismaClient;
let saved: {key:string;value:Prisma.JsonValue}[]=[];
const prefix=`linkedin-test-${randomUUID()}`;
const keys=["discovery:linkedin:config","discovery:linkedin:queue","discovery:preferences","discovery:linkedin:state"];
const postingIds:string[]=[];
let sequence=Number(String(Date.now()).slice(-10));
const description=`About the job\nProvide application support, troubleshoot incidents and investigate SQL data. Manage Jira service requests, REST API integrations, user access and application monitoring. Maintain knowledge base documentation and automate routine support workflows with Python.\nRequired qualifications\nBachelor degree in Computer Science or equivalent experience.\n1+ years application support experience.\nTroubleshooting, SQL, documentation, communication and user access administration.\nFull-time. Annual base salary $85,000 - $95,000.\n`;
async function ingest(extra:Record<string,unknown>={}) {
 const {ingestLinkedIn}=await import("../../src/lib/discovery/linkedin");
 const n=String(++sequence);
 const raw={externalId:n,sourceUrl:`https://www.linkedin.com/jobs/view/${n}/`,company:prefix,title:"Application Support Analyst",location:"Brea, CA",employmentType:"Full-time",workArrangement:"On-site",description,postedAt:new Date(Date.now()-3600000).toISOString(),applyUrl:`https://job-boards.greenhouse.io/testcompany/jobs/${n}`,topApplicant:true,...extra};
 const result=await ingestLinkedIn(raw,"day");postingIds.push(result.id);return {result,raw};
}
before(async()=>{
 db=(await import("../../src/lib/db")).db;
 saved=await db.setting.findMany({where:{key:{in:keys}},select:{key:true,value:true}});
 for(const [key,value] of [[keys[0],{enabled:true,autoTailor:true,dailyLimit:10}],[keys[2],{minimumSalary:60000,radiusMiles:30,includeRemote:false}] ] as const)await db.setting.upsert({where:{key},create:{key,value},update:{value}});
});
after(async()=>{
 await db.job.deleteMany({where:{company:{startsWith:prefix}}});
 await db.discoveryPosting.deleteMany({where:{id:{in:postingIds}}});
 await db.setting.deleteMany({where:{OR:[{key:{in:keys}},{key:{in:postingIds.map(id=>`discovery:linkedin:job:${id}`)}}]}});
 for(const row of saved)await db.setting.create({data:{key:row.key,value:row.value as Prisma.InputJsonValue}});
 await db.$disconnect();
});
test("collector record persists into normal application/run, cross-source history and dismissal win",async()=>{
 const {approvePosting,discoverySnapshot}=await import("../../src/lib/discovery/service");
 const {ingestLinkedIn}=await import("../../src/lib/discovery/linkedin");
 const first=await ingest();
 const approved=await approvePosting(first.result.id,true,"linkedin");
 assert.equal(approved.duplicate,false);
 const application=await db.application.findUniqueOrThrow({where:{id:approved.id},include:{job:true,tailoringRuns:true}});
 assert.equal(application.job.cleanDescription,description.trim());assert.equal(application.job.applyUrl,first.raw.applyUrl);assert.equal(application.tailoringRuns[0].status,"QUEUED");assert.equal(application.status,"TAILORING");
 const duplicate=await ingest({externalId:String(++sequence),sourceUrl:`https://www.linkedin.com/jobs/view/${sequence}/`,company:prefix+" Inc.",applyUrl:first.raw.applyUrl+"?utm_source=linkedin"});
 assert.equal(duplicate.result.duplicate,true);
 assert.equal((await approvePosting(duplicate.result.id,true,"linkedin")).id,approved.id);
 const firstPosting=await db.discoveryPosting.findUniqueOrThrow({where:{id:first.result.id}});
 const feed=await db.discoveryPosting.create({data:{...firstPosting,matchReasons:firstPosting.matchReasons as Prisma.InputJsonValue,cautions:firstPosting.cautions as Prisma.InputJsonValue,id:randomUUID(),sourceKey:"greenhouse:test",sourceUrl:first.raw.applyUrl,approvedApplicationId:null}});postingIds.push(feed.id);
 assert.equal((await approvePosting(feed.id,true)).id,approved.id,"employer feed arriving after LinkedIn links the same application");
 const before=(await db.discoveryPosting.findUniqueOrThrow({where:{id:first.result.id}})).postedAt;
 await ingestLinkedIn({...first.raw,postedAt:new Date().toISOString()},"week");
 assert.equal((await db.discoveryPosting.findUniqueOrThrow({where:{id:first.result.id}})).postedAt?.toISOString(),before?.toISOString());
 const snapshot=await discoverySnapshot();assert.equal(snapshot.postings.find(p=>p.id===first.result.id)?.application?.id,approved.id);
 const hidden=await ingest({title:"IT Support Specialist"});await db.discoveryPosting.update({where:{id:hidden.result.id},data:{dismissedAt:new Date()}});
 await assert.rejects(approvePosting(hidden.result.id,true,"linkedin"),/Dismissed/);
 await db.tailoringRun.updateMany({where:{applicationId:approved.id},data:{status:"CANCELLED"}});
});
test("concurrent queue creation enforces capacity and Pacific ten/day, deferred survive",async()=>{
 const {approvePosting}=await import("../../src/lib/discovery/service");
 const {queueLinkedIn}=await import("../../src/lib/discovery/linkedin");
 const fixtures=[];for(let i=0;i<14;i++)fixtures.push(await ingest({title:`Application Support Analyst ${i}`}));
 for(let round=0;round<4;round++) {
  await Promise.allSettled(fixtures.map(f=>approvePosting(f.result.id,true,"linkedin")));
  const active=await db.tailoringRun.count({where:{status:{in:["QUEUED","RUNNING"]}}});assert.ok(active<=4,`capacity ${active}`);
  await db.tailoringRun.updateMany({where:{application:{job:{company:prefix}},status:"QUEUED"},data:{status:"CANCELLED"}});
 }
 const {pacificDayStart}=await import("../../src/lib/discovery/linkedin-policy");
 const used=await db.applicationEvent.count({where:{eventType:"discovery_approved",occurredAt:{gte:pacificDayStart()},detail:{path:["source"],equals:"linkedin:premium"},toValue:"TAILORING"}});
 assert.equal(used,10);
 const pending=await db.discoveryPosting.count({where:{id:{in:fixtures.map(f=>f.result.id)},approvedApplicationId:null}});assert.ok(pending>=4);
 const queue=await queueLinkedIn();assert.ok(queue.deferred>=4);assert.equal(queue.queued,0);assert.ok(queue.items.some(i=>i.status==="deferred_day"));
 // Tomorrow's budget: move only our events to yesterday; no browser recollection needed.
 await db.applicationEvent.updateMany({where:{application:{job:{company:prefix}},eventType:"discovery_approved"},data:{occurredAt:new Date(Date.now()-86400000)}});
 const tomorrow=await queueLinkedIn();assert.equal(tomorrow.queued,4);assert.ok(tomorrow.deferred>0);
});
test("disabled tailoring retains jobs and unsafe URLs/import origins fail closed",async()=>{
 const {queueLinkedIn}=await import("../../src/lib/discovery/linkedin");
 await db.setting.update({where:{key:keys[0]},data:{value:{enabled:true,autoTailor:false,dailyLimit:10}}});
 const result=await queueLinkedIn();assert.equal(result.queued,0);assert.ok(result.items.every(i=>i.status==="paused"));
 const {POST}=await import("../../src/app/api/discovery/linkedin/route");
 const response=await POST(new Request("http://localhost/api/discovery/linkedin",{method:"POST",headers:{origin:"https://untrusted.test"},body:JSON.stringify({action:"pause"})}));assert.equal(response.status,403);
 const bad=await ingest({title:"Technical Support Analyst",applyUrl:"http://127.0.0.1/private"});assert.equal(bad.result.pipeline.status,"needs_review");
});

test("assisted pasted job imports selected details without contacting LinkedIn",async()=>{
 const {importLinkedInPaste}=await import("../../src/lib/discovery/linkedin");
 const n=String(++sequence);
 const result=await importLinkedInPaste({sourceUrl:`https://www.linkedin.com/jobs/view/${n}/`,applyUrl:`https://careers.example.com/jobs/${n}`,text:`Company logo for, ${prefix}.\n${prefix}\nApplication Support Consultant\nBrea, CA · Reposted 2 days ago\nOn-site\nFull-time\nYou’d be a top applicant\n${description}`});postingIds.push(result.id);
 const row=await db.discoveryPosting.findUniqueOrThrow({where:{id:result.id}});
 assert.equal(row.company,prefix);assert.equal(row.title,"Application Support Consultant");assert.equal(row.location,"Brea, CA");assert.equal(row.salaryMin,85000);assert.ok(row.postedAt);assert.equal(row.approvedApplicationId,null);
 const metadata=await db.setting.findUniqueOrThrow({where:{key:`discovery:linkedin:job:${row.id}`}});
 assert.equal((metadata.value as Record<string,unknown>).origin,"paste");assert.equal((metadata.value as Record<string,unknown>).premiumSignal,"TOP_APPLICANT");
});

test("first full cycle requires one-job validation and manual checks cannot clear cooldown",async()=>{
 const {scanLinkedIn}=await import("../../src/lib/discovery/linkedin");
 await db.setting.upsert({where:{key:keys[3]},create:{key:keys[3],value:{}},update:{value:{}}});
 assert.equal((await scanLinkedIn("both",true))?.status,"needs_validation");
 const retryAfter=new Date(Date.now()+86400000).toISOString();
 await db.setting.update({where:{key:keys[3]},data:{value:{retryAfter}}});
 assert.equal((await scanLinkedIn("day",true,"4458415638"))?.status,"cooldown");
 assert.deepEqual((await db.setting.findUniqueOrThrow({where:{key:keys[3]}})).value,{retryAfter});
});

test("saving a preferred search preserves queue preferences and access cooldown without scanning",async()=>{
 const {configureLinkedInSearch}=await import("../../src/lib/discovery/linkedin");
 const beforeConfig=(await db.setting.findUniqueOrThrow({where:{key:keys[0]}})).value as Record<string,unknown>;
 const beforeState=(await db.setting.findUniqueOrThrow({where:{key:keys[3]}})).value;
 const url="https://www.linkedin.com/jobs/search-results/?keywords=Application+Support+Engineer&geoId=104234982&distance=35&f_TPR=r604800&f_SAL=f_SA_id_226001%3A272015&eBP=tracking";
 const result=await configureLinkedInSearch(url);assert.ok(result.preferredSearchUrl);assert.ok(!result.preferredSearchUrl.includes("eBP"));
 const afterConfig=(await db.setting.findUniqueOrThrow({where:{key:keys[0]}})).value as Record<string,unknown>;
 for(const key of ["enabled","autoTailor","dailyLimit"])assert.equal(afterConfig[key],beforeConfig[key]);
 assert.deepEqual((await db.setting.findUniqueOrThrow({where:{key:keys[3]}})).value,beforeState);
 await assert.rejects(configureLinkedInSearch("https://localhost/jobs/search?keywords=IT"),/LinkedIn job-search URL/);
});
