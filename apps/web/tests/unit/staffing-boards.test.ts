import test from 'node:test';
import assert from 'node:assert/strict';
import { balboaLinks, balboaOpening, collectStaffingBoard, luxusOpenings, LUXUS_FEED } from '../../src/lib/discovery/staffing-boards';
import { DISCOVERY_SOURCES } from '../../src/lib/discovery/sources';
const b=DISCOVERY_SOURCES.find(s=>s.key==='trinet:balboa')!;
const l=DISCOVERY_SOURCES.find(s=>s.key==='luxus:careers')!;
const duties='Resolve support tickets, troubleshoot user computers and applications, maintain accounts and document incidents. '.repeat(4);
const html=(salary='$60,000 - $90,000',term='Full-time')=>`<h3 class="job-name">Helpdesk Technician</h3><ul class="job-meta"><li>Irvine, CA</li><li>Type: ${term}</li><li>Salary: ${salary}</li></ul><article><div class="job-descr content"><p>${duties}</p></div></article><form id="new_applicant"></form>`;
const url='https://app.trinethire.com/companies/50346/jobs/12345-helpdesk-technician';
const job={job_num:'1',portal_url_slug:'it-support-1',portal_title:'IT Support Specialist',sync_status:'active',portal_city:'Irvine',portal_state:'CA',portal_country:'United States',portal_compensation:'Salary',salary_min:65000,salary_max:85000,opportunity_type:'Perm Job',work_site:'onsite',portal_description:`<p>Work Schedule: Full-Time | In-Office</p><p>Salary: $65,000–$85,000 annually</p><p>${duties}</p>`};
test('both dynamic boards registered; Balboa canonicalizes future jobs and rejects foreign links',()=>{
 assert.ok(b&&l);
 const board=`<table class="table job-list"><a href="/companies/50346-balboa-technologies/jobs/12345-helpdesk-technician">Helpdesk Technician</a><a href="https://evil.example/jobs/2">IT Support</a></table>`;
 assert.deepEqual(balboaLinks(board),[url]);
 const j=balboaOpening(b,html(),url)!;assert.equal(j.salaryMin,60000);assert.equal(j.employmentType,'Full-time');assert.equal(j.location,'Irvine, CA');
 assert.equal(balboaOpening(b,html('$50,000 - $90,000'),url)?.salaryMin,50000);
 assert.equal(balboaOpening(b,html('Not listed'),url)?.salaryMin,null);
 assert.equal(balboaOpening(b,html(undefined,'Contract'),url)?.employmentType,'Other');
 assert.equal(balboaOpening(b,html().replace('new_applicant','closed'),url),null);
 assert.equal(balboaOpening(b,html(),url.replace('app.trinethire.com','evil.example')),null);
 assert.throws(()=>balboaLinks('<html>Sign in</html>'));
});
test('Luxus retains conservative conflicting pay, actual full-time schedule and strips SEO appendix',()=>{
 const [j]=luxusOpenings(l,[{...job,salary_min:50000,portal_description:job.portal_description+'Recruiting Keywords: Kubernetes'}]);
 assert.equal(j.salaryMin,50000);assert.equal(j.employmentType,'Full-time');assert.equal(j.workArrangement,'On-site');assert.ok(!j.description.includes('Kubernetes'));
 assert.equal(luxusOpenings(l,[{...job,opportunity_type:'Contract'}])[0].employmentType,'Other');
 assert.equal(luxusOpenings(l,[{...job,portal_description:duties}])[0].employmentType,'Not listed');
 assert.equal(luxusOpenings(l,[{...job,salary_min:null,salary_max:null,portal_description:duties}])[0].salaryMin,null);
 assert.deepEqual(luxusOpenings(l,[{...job,sync_status:'closed'},{...job,portal_url_slug:'https://evil.example'}]),[]);
 assert.throws(()=>luxusOpenings(l,{error:'Sign in'}));
});
test('collector fetches current full feed, treats truncation/incomplete details as non-authoritative',async()=>{
 const original=globalThis.fetch;const calls:string[]=[];
 try{
  globalThis.fetch=async(input)=>{calls.push(String(input));return new Response(JSON.stringify([job,{...job,job_num:'2',portal_url_slug:'new-it-support-2'}]));};
  const r=await collectStaffingBoard(l);assert.equal(r.openings.length,2);assert.equal(r.complete,true);assert.equal(r.authoritative,false);assert.deepEqual(calls,[LUXUS_FEED]);
  globalThis.fetch=async()=>new Response(JSON.stringify(Array.from({length:1000},()=>job)));
  assert.equal((await collectStaffingBoard(l)).complete,false);
  globalThis.fetch=async(input)=>new Response(String(input).endsWith('/jobs')?'<table class="job-list"><a href="/companies/50346/jobs/12345-helpdesk-technician">Helpdesk Technician</a></table>':'<html>unavailable</html>');
  const failed=await collectStaffingBoard(b);assert.equal(failed.complete,false);assert.equal(failed.failures,1);
 }finally{globalThis.fetch=original;}
});
