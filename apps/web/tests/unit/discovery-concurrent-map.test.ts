import test from 'node:test';import assert from 'node:assert/strict';import {settledConcurrentMap}from '../../src/lib/discovery/concurrent-map';
test('available source lanes progress while one source waits, retaining order and failures',async()=>{
 let release!:()=>void,fastDone!:()=>void;const slow=new Promise<void>(r=>release=r),fast=new Promise<void>(r=>fastDone=r);let active=0,maximum=0;const visited:number[]=[];
 const pending=settledConcurrentMap([0,1,2,3,4],2,async n=>{active++;maximum=Math.max(maximum,active);visited.push(n);try{if(n===0)await slow;if(n===3)throw Error('isolated source failure');if(n===4)fastDone();return n;}finally{active--;}});
 await fast;assert.deepEqual(visited,[0,1,2,3,4]);assert.equal(maximum,2);release();const result=await pending;
 assert.deepEqual(result.map(r=>r.status),['fulfilled','fulfilled','fulfilled','rejected','fulfilled']);assert.deepEqual(result.filter(r=>r.status==='fulfilled').map(r=>r.value),[0,1,2,4]);
});
test('empty sources finish and invalid concurrency is rejected',async()=>{assert.deepEqual(await settledConcurrentMap([],4,async()=>0),[]);await assert.rejects(settledConcurrentMap([],0,async()=>0),/positive integer/);});

test('source publication queues before acquiring database resources and recovers after failure', async () => {
 const { serialPublisher } = await import('../../src/lib/discovery/concurrent-map');
 const publish = serialPublisher();
 let release!: () => void;
 const gate = new Promise<void>(resolve => { release = resolve; });
 const visited: number[] = [];
 const first = publish(async () => { visited.push(1); await gate; return 1; });
 const second = publish(async () => { visited.push(2); throw new Error('source failed'); });
 const rejected = assert.rejects(second, /source failed/);
 const third = publish(async () => { visited.push(3); return 3; });
 await Promise.resolve();
 assert.deepEqual(visited, [1]);
 release();
 assert.equal(await first, 1);
 await rejected;
 assert.equal(await third, 3);
 assert.deepEqual(visited, [1, 2, 3]);
});
