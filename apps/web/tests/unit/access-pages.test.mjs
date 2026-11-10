import test from 'node:test';import assert from 'node:assert/strict';
import {AccessPages} from '../../scripts/application-browser/access-pages.mjs';
const job = (id='a') => ({applicationId:id,attemptId:`attempt-${id}`,destination:`https://example.com/${id}`});
const fixture = (j=job(),context={}) => ({job:j,context,page:{isClosed:()=>false},submissionStarted:false,detach(){this.detached=true;}});
test('blocked login survives unrelated jobs and only exact same-device job can take it',()=>{
 const pages=new AccessPages();const j=job(),d=fixture(j);assert.equal(pages.retain(j,d,{status:'BLOCKED',summary:'Workday sign-in required'}),'retained');assert.equal(pages.has(d),true);
 assert.equal(pages.take({...j,applicationId:'other'},d.context),null);assert.equal(pages.take({...j,destination:'https://other.com'},d.context),null);assert.equal(pages.take(j,{}),null);
 assert.equal(pages.take({...j,attemptId:'new-attempt'},d.context),d.page);assert.equal(d.detached,true);assert.equal(pages.has(d),false);
});
test('uncertain submissions never become reusable login pages',()=>{
 const pages=new AccessPages(),j=job(),d=fixture(j);assert.equal(pages.retain(j,d,{status:'UNKNOWN',summary:'verification'}),'not-access');d.submissionStarted=true;assert.equal(pages.retain(j,d,{status:'BLOCKED',summary:'verification'}),'not-access');assert.equal(pages.entries.size,0);
});
test('capacity never evicts an existing sign-in and closed pages release slots',()=>{
 const pages=new AccessPages(1),a=fixture(),b=fixture(job('b'));
 pages.retain(a.job,a,{status:'BLOCKED',summary:'Login required'});assert.equal(pages.retain(b.job,b,{status:'BLOCKED',summary:'Login required'}),'capacity');assert.equal(pages.has(a),true);
 a.page.isClosed=()=>true;assert.equal(pages.retain(b.job,b,{status:'BLOCKED',summary:'CAPTCHA'}),'retained');assert.equal(a.detached,true);
});
