import assert from "node:assert/strict";
import test from "node:test";
import { collectOracle, normalizeOracleOpening } from "../../src/lib/discovery/oracle";
import { localDistance } from "../../src/lib/discovery/matching";
import type { Source } from "../../src/lib/discovery/types";
const source: Source = { key:"oracle:hoag",provider:"oracle",board:"hoag",company:"Fixture",url:"https://jobs.hoag.org/en/sites/CX_1/jobs" };
const json = (body: unknown) => new Response(JSON.stringify(body));
const detail = (extra: Record<string,unknown> = {}) => ({Id:"1",Title:"Application Support Specialist",ExternalDescriptionStr:"Troubleshoot application incidents, assist users and document resolution procedures. ".repeat(2),ExternalPostedStartDate:"2026-10-20T10:00:00Z",JobSchedule:null,workLocation:[{AddressLine1:"123 Main St",TownOrCity:"Long Beach",Region2:"CA",PostalCode:"90802"}],requisitionFlexFields:[{Prompt:"Job Schedule",Value:"Full Time"},{Prompt:"Pay Range",Value:"$55.53 - $85.80"},{Prompt:"Remote or Onsite",Value:"Onsite"}],...extra});
const list = (offset: number, rows: unknown[], total: number) => ({count:1,hasMore:false,items:[{Offset:offset,Limit:25,TotalJobsCount:total,requisitionList:rows}]});
test("Oracle uses explicit schedule and address, never infers an hourly pay period",()=>{
 const opening=normalizeOracleOpening(source,detail(),"1")!;
 assert.equal(opening.employmentType,"Full-time");assert.equal(opening.workArrangement,"On-site");assert.equal(opening.salaryMin,null);assert.match(opening.salaryText!,/unconfirmed/);assert.equal(opening.postedAt!.toISOString(),"2026-10-20T10:00:00.000Z");assert.ok(localDistance(opening.location)!<30);
 assert.equal(normalizeOracleOpening(source,detail({ExternalDescriptionStr:"Hourly staff may contact this team. " + detail().ExternalDescriptionStr}),"1")!.salaryMin,null);
 assert.equal(normalizeOracleOpening(source,detail({JobSchedule:"Part time"}),"1")!.employmentType,"Other");
 assert.equal(normalizeOracleOpening(source,detail({PayRange:"Annual base salary $65,000 - $80,000"}),"1")!.salaryMin,65000);
});
test("Oracle preserves missing-worksite and multiple-address ambiguity",()=>{
 for(const extra of [{secondaryLocations:[{PrimaryLocation:"Unconfirmed"}]},{otherWorkLocations:[{AddressLine1:"456 Main St",TownOrCity:"Long Beach",Region2:"CA"}]}]){
  const opening=normalizeOracleOpening(source,detail(extra),"1")!;
  assert.equal(localDistance(opening.location),null);assert.match(opening.description,/confirmation required/);
 }
});
test("Oracle rejects mismatched/expired detail and ignores internal claims",()=>{
 assert.throws(()=>normalizeOracleOpening(source,detail(),"2"),/identity/);
 assert.equal(normalizeOracleOpening(source,detail({ExternalPostedEndDate:"2020-01-01",ApplyWhenNotPostedFlag:true}),"1"),null);
 const opening=normalizeOracleOpening(source,detail({InternalDescriptionStr:"secret internal claim"}),"1")!;assert.doesNotMatch(opening.description,/secret/);
});
test("Oracle follows nested pagination despite wrapper hasMore false",async t=>{
 const offsets:number[]=[];
 t.mock.method(globalThis,"fetch",async (raw:string)=>{
  const url=new URL(raw);const finder=url.searchParams.get("finder")!;
  if(url.pathname.endsWith("recruitingCEJobRequisitionDetails"))return json({items:[detail({Id:"26"})]});
  const offset=Number(finder.match(/offset=(\d+)/)![1]);offsets.push(offset);
  return json(list(offset,offset===0?Array.from({length:25},(_,i)=>({Id:String(i+1),Title:"Bus Operator"})):[{Id:"26",Title:"IT Support Specialist"}],26));
 });
 const result=await collectOracle(source);assert.deepEqual(offsets,[0,25]);assert.equal(result.checked,26);assert.equal(result.complete,true);assert.equal(result.openings.length,1);
});
test("Oracle parks detail failures and stops after provider access denial",async t=>{
 let details=0;
 t.mock.method(globalThis,"fetch",async(raw:string)=>{
  if(raw.includes("recruitingCEJobRequisitionDetails")){details++;return new Response("private",{status:429});}
  return json(list(0,[{Id:"1",Title:"IT Support Specialist"},{Id:"2",Title:"IT Support Specialist"}],2));
 });
 const result=await collectOracle(source);assert.equal(details,1);assert.equal(result.complete,false);assert.equal(result.openings.length,0);assert.match(result.message!,/HTTP 429/);assert.doesNotMatch(result.message!,/private/);
});
test("Oracle never requests detail for jobs absent from the listing",async t=>{
 let requests=0;t.mock.method(globalThis,"fetch",async()=>{requests++;return json(list(0,[],0));});
 const result=await collectOracle(source);assert.equal(requests,1);assert.deepEqual(result.openings,[]);assert.equal(result.complete,true);
});
test("Oracle fails closed on malformed envelope and bounded/incomplete pages",async t=>{
 t.mock.method(globalThis,"fetch",async()=>json(list(0,[{Id:"1",Title:"Bus Operator"}],26)));
 assert.equal((await collectOracle(source)).complete,false);
 t.mock.method(globalThis,"fetch",async()=>json({items:[{requisitionList:[]}]}));
 await assert.rejects(collectOracle(source),/format/);
});

test("Oracle repeated or changing pages never authorize closing missing jobs",async t=>{
 for(const changed of [false,true]){
  t.mock.method(globalThis,"fetch",async(raw:string)=>{
   const offset=Number(new URL(raw).searchParams.get("finder")!.match(/offset=(\d+)/)![1]);
   return json(list(offset,Array.from({length:25},(_,i)=>({Id:String(i+1),Title:"Bus Operator"})),changed&&offset?26:50));
  });
  const result=await collectOracle(source);assert.equal(result.complete,false);assert.equal(result.checked,25);
 }
});

test("Oracle never geocodes a foreign same-name city as local",()=>{
 const opening=normalizeOracleOpening(source,detail({workLocation:[{AddressLine1:"1 Main St",TownOrCity:"Long Beach",Region2:"NS",Country:"CA",PostalCode:"B0J"}]}),"1")!;
 assert.equal(localDistance(opening.location),null);assert.match(opening.description,/Long Beach, NS, B0J, CA/);
});
