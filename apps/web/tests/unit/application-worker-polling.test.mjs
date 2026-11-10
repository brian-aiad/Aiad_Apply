import test from 'node:test';
import assert from 'node:assert/strict';
import {QueuePolling} from '../../scripts/application-browser/worker-polling.mjs';
test('idle queues and errors back off boundedly, a claim restores prompt work',()=>{
 const q=new QueuePolling();let now=1000;
 assert.ok(q.due(now));
 for(const delay of [5000,10000,20000,30000,30000]){
  q.observed(false,now);assert.equal(q.nextAt-now,delay);assert.equal(q.due(now+delay-1),false);now+=delay;assert.ok(q.due(now));
 }
 for(const delay of [5000,10000,20000,40000,60000,60000]){q.failed(now);assert.equal(q.nextAt-now,delay);now+=delay;}
 q.observed(true,now);assert.ok(q.due(now));assert.equal(q.empty,0);assert.equal(q.failures,0);
 q.observed(false,now);assert.equal(q.nextAt-now,5000);
});
