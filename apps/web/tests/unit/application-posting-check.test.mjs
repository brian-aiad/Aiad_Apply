import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPosting} from '../../scripts/application-browser/posting-check.mjs';
const job={destination:'https://boards.greenhouse.io/acme/jobs/123?gh_jid=123',title:'Support Engineer'};
test('posting preflight requires exact current job and rejects retired/replaced postings',async()=>{
  let requested;
  assert.deepEqual(await checkPosting(job,async url=>{requested=url;return new Response(JSON.stringify({id:123,title:'Support Engineer'}));}),{checked:true,available:true,jobId:'123'});
  assert.equal(requested,'https://boards-api.greenhouse.io/v1/boards/acme/jobs/123');
  for(const status of [404,410]) await assert.rejects(checkPosting(job,async()=>new Response('',{status})),/no longer available/);
  await assert.rejects(checkPosting(job,async()=>new Response(JSON.stringify({id:123,title:'Different role'}))),/different job title/);
});
test('temporary ATS errors fall back to browser verification and unknown hosts never fetch',async()=>{
  for(const fetcher of [async()=>{throw new Error('timeout')},async()=>new Response('',{status:503}),async()=>new Response('bad json'),async()=>new Response(JSON.stringify({id:456,title:'Support Engineer'}))]) assert.deepEqual(await checkPosting(job,fetcher),{checked:false});
  assert.deepEqual(await checkPosting({...job,destination:'https://example.com/acme/jobs/123'},async()=>{throw new Error('Must not call')}),{checked:false});
});
