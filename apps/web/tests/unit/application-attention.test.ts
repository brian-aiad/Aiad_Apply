import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationAttention } from '../../src/lib/application-attention';
const attempt = {status:'BLOCKED',runId:'a1111111-1111-4111-8111-111111111111',runNumber:1,artifactId:'b1111111-1111-4111-8111-111111111111',resumeSha256:'a'.repeat(64),fileName:'resume.pdf',destination:'https://example.com/jobs/1',approvedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),summary:'',questions:[],unresolved:[],attachmentVerified:false};
test('confirmed lifecycle states suppress stale automation blockers',()=>{
 for(const status of ['APPLIED','INTERVIEW','CLOSED'])for(const toValue of ['BLOCKED','UNKNOWN','RUNNING'])assert.equal(applicationAttention(status,{toValue}),null);
});
test('latest authoritative attempt separates active work and uncertainty',()=>{
 for(const toValue of ['QUEUED','RUNNING','SUBMITTING'])assert.equal(applicationAttention('REVIEW',{toValue}),'ACTIVE');
 assert.equal(applicationAttention('REVIEW',{toValue:'UNKNOWN'}),'UNKNOWN');
 assert.equal(applicationAttention('REVIEW',{toValue:'CANCELED'}),null);
 assert.equal(applicationAttention('REVIEW',{toValue:'BLOCKED',detail:{...attempt,status:'RUNNING'}}),'ACTIVE');
});
test('technical and access blockers are not requests for personal answers',()=>{
 const classify=(summary:string)=>applicationAttention('REVIEW',{toValue:'BLOCKED',detail:{...attempt,summary}});
 assert.equal(classify('Required ITAR selection needs exact option wording.'),'TECHNICAL');
 assert.equal(classify('Employer login required.'),'ACCESS');
 assert.equal(classify('Required information: weekly hours must be confirmed.'),'ANSWERS');
 assert.equal(classify('Required information from job description: confirm weekly hours.'),'ANSWERS');
 assert.equal(classify('Live minimum salary is below policy.'),'PARKED');
 assert.equal(applicationAttention('REVIEW',{detail:{...attempt,questions:[{question:'Weekly hours?',answer:'',source:'unanswered'}]}}),'ANSWERS');
});
