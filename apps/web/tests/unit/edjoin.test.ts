import test from 'node:test';import assert from 'node:assert/strict';
import {schoolFeed,schoolOpening} from '../../src/lib/discovery/edjoin';import {DISCOVERY_SOURCES} from '../../src/lib/discovery/sources';
const s=DISCOVERY_SOURCES.find(s=>s.key==='edjoin:orange-schools')!;const now=new Date('2026-10-20T00:00:00Z');
const j={'@type':'JobPosting',identifier:{value:12345},title:'Software Application Support Specialist (Outside Candidates)',hiringOrganization:{name:'Local District'},description:'Troubleshoot software, support users, validate database reports and document procedures. '.repeat(5),jobLocation:[{address:{addressLocality:'Irvine',addressRegion:'CA',addressCountry:'US'}}],baseSalary:{currency:'USD',value:{minValue:5148,maxValue:6414,unitText:'MONTH'}},employmentType:['FULL_TIME'],datePosted:'2026-10-07',validThrough:'2026-10-22T06:45:00Z'};
const html=(v:unknown=j,year='40 hours/week;12 months/year')=>`<script type="application/ld+json">${JSON.stringify(v)}</script><div>Length of Work Year: ${year}</div>`;
test('school feed dynamically discovers new external jobs and discloses pagination or malformed data',()=>{
 const data=[{postingID:12345,positionTitle:'Software Application Support Specialist (Outside Candidates)'},{postingID:12346,positionTitle:'Application Support (Current Employees ONLY)'}];
 assert.deepEqual(schoolFeed({data,totalRecords:2,totalPages:1}).ids,['12345']);assert.equal(schoolFeed({data,totalRecords:150,totalPages:2}).complete,false);assert.throws(()=>schoolFeed({data:[{}],totalRecords:1,totalPages:1}));assert.throws(()=>schoolFeed({error:'Sign in'}));
});
test('school posting confirms 12 month annual base, full time and actual worksite; no optimistic school-year annualization',()=>{
 const r=schoolOpening(s,html(),'12345',now)!;assert.equal(r.salaryMin,61776);assert.equal(r.employmentType,'Full-time');assert.equal(r.location,'Irvine, CA, US');
 assert.equal(schoolOpening(s,html({...j,workHours:'40 hours/week;11 months/year'},'11 months/year'),'12345',now)?.salaryMin,56628);
 assert.equal(schoolOpening(s,html(j,'School year'),'12345',now)?.salaryMin,null);
 assert.equal(schoolOpening(s,html({...j,validThrough:'2026-10-19'}),'12345',now),null);
 assert.equal(schoolOpening(s,html({...j,title:'Application Support (Current Employee)'}),'12345',now),null);
 assert.equal(schoolOpening(s,html(),'99999',now),null);
 assert.equal(schoolOpening(s,html({...j,employmentType:['PART_TIME']}),'12345',now)?.employmentType,'Other');
});
