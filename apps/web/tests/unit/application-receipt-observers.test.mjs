import test from 'node:test';
import assert from 'node:assert/strict';
import {ReceiptObservers} from '../../scripts/application-browser/receipt-observers.mjs';
test('uncertain receipt observation yields to other work and reconciles once without submitting',async()=>{
 const observers=new ReceiptObservers();let closed=false,receipt=false,reconciled=0,nextJobs=0;
 const driver={page:{isClosed:()=>closed},context:{},submissionStarted:true};
 observers.add({attemptId:'uncertain'},driver);
 const observe=async entry=>{assert.equal(entry.driver,driver);if(!receipt)return false;reconciled++;return true;};
 for(let i=0;i<3;i++){await observers.poll(observe,assert.fail);nextJobs++;}
 assert.equal(nextJobs,3);assert.equal(observers.context(),driver.context);assert.equal(reconciled,0);
 receipt=true;await observers.poll(observe,assert.fail);await observers.poll(observe,assert.fail);
 assert.equal(reconciled,1);assert.equal(observers.entries.size,0);assert.equal(closed,false);
});
test('one failed observation does not block another; pending-report failures can stop polling',async()=>{
 const observers=new ReceiptObservers();const driver={page:{isClosed:()=>false},context:{}};
 observers.add({attemptId:'one'},driver);observers.add({attemptId:'two'},driver);
 const errors=[];await observers.poll(async e=>{if(e.job.attemptId==='one')throw Error('read failed');return true;},e=>errors.push(e.message));
 assert.deepEqual(errors,['read failed']);assert.deepEqual([...observers.entries.keys()],['one']);
 await assert.rejects(observers.poll(async()=>{throw Error('report pending');},e=>{throw e;}),/report pending/);
 assert.equal(observers.entries.size,1);
});
