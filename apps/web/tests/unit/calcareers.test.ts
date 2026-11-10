import test from 'node:test';
import assert from 'node:assert/strict';
import {stateOpening,stateSearchForm,stateSearchResults} from '../../src/lib/discovery/calcareers';
import {DISCOVERY_SOURCES} from '../../src/lib/discovery/sources';
const source=DISCOVERY_SOURCES.find(s=>s.key==='calcareers:orange')!;
const span=(id:string,value:string)=>`<span id="${id}">${value}</span>`;
const duties='Provide application support, troubleshoot user tickets, validate database reports and document procedures. '.repeat(5);
const html=(location='This position is located in Irvine, California.',pay='$5,148 - $6,414 per Month',term='Permanent, Full Time',deadline='10/29/2026')=>span('lblDetailsJobControlNumber','JC-123456')+span('lblWorkingTitle','Application Support Analyst')+span('lblDepartmentName','State Department')+span('lblPrimarySalary',pay)+span('lblFinalFilingDate',deadline)+span('lblWorkLocation','Orange County')+span('lblJobType',term)+span('lblTelework','Hybrid')+`<div id="pnlJobDescription">${duties}</div><div id="pnlWorkingConditions">${location}</div><div id="pnlOther">Mail applications to Sacramento</div>`;
const now=new Date('2026-10-20T12:00:00Z');
test('state search uses current public form without truncating large viewstate or losing county filters',()=>{
 const state='A'.repeat(150000)+'==';const form=stateSearchForm(`<input type="hidden" name="__VIEWSTATE" value="${state}">`,source.key);
 assert.equal(form.get('__VIEWSTATE'),state);assert.ok(form.get('ctl00$cphMainContent$hdnSearchCriteria')?.includes('locid=358'));
 assert.throws(()=>stateSearchForm('<html>Sign in</html>',source.key));assert.throws(()=>stateSearchForm('', 'untrusted'));
});
test('state search counts all results and reads visible publication date, not stale template datetime',()=>{
 const card=`id="cphMainContent_rptResults_pnlCardContainer_0"><a href="https://www.calcareers.ca.gov/CalHrPublic/Jobs/JobPosting.aspx?JobControlId=123456">IT</a>Publish Date:<time datetime="2016-06-30">10/19/2026</time>`;
 const page=(n:number)=>span('cphMainContent_lblTotalResultCount',String(n))+card;
 const r=stateSearchResults(page(1));assert.deepEqual(r.ids,['123456']);assert.equal(r.complete,true);assert.equal(r.dates['123456'].getUTCFullYear(),2026);
 assert.equal(stateSearchResults(page(11)).complete,false);assert.throws(()=>stateSearchResults('<html>Verification required</html>'));
});
test('state postings retain lowest base range, actual term and confirmed duty worksite, never mailing addresses',()=>{
 const j=stateOpening(source,html(),'123456',now)!;assert.equal(j.salaryMin,61776);assert.equal(j.employmentType,'Full-time');assert.equal(j.location,'Irvine, CA');assert.equal(j.postedAt,null);
 assert.equal(stateOpening(source,html('Worksite not stated.'),'123456',now)?.location,'Orange County');
 assert.equal(stateOpening(source,html(undefined,'$4,935 - $8,740 per Month'),'123456',now)?.salaryMin,59220);
 assert.equal(stateOpening(source,html(undefined,undefined,'Limited Term Fulltime'),'123456',now)?.employmentType,'Other');
 assert.equal(stateOpening(source,html(undefined,undefined,undefined,'10/19/2026'),'123456',now),null);
 assert.equal(stateOpening(source,html(),'999999',now),null);
 assert.equal(stateOpening(source,html(undefined,undefined,undefined,'Until filled'),'123456',now),null);
});

 test('state deadlines follow Pacific winter time and reject impossible dates',()=>{
 assert.ok(stateOpening(source,html(undefined,undefined,undefined,'12/01/2026'),'123456',new Date('2026-12-02T07:30:00Z')));
 assert.equal(stateOpening(source,html(undefined,undefined,undefined,'02/30/2026'),'123456',now),null);
 });
