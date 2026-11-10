import test from 'node:test';import assert from 'node:assert/strict';
import {listingAgeDays,listingAgePriority,listingAgeBlocker} from '../../src/lib/discovery/listing-age';
const now=new Date('2026-10-20T12:00:00Z');
test('age priority uses original publication, not fresh observation',()=>{
 for(const [postedAt,priority] of [['2026-10-19',0],['2026-10-10',1],['2026-09-25',2],[null,3],['2026-09-01',4]] as const)assert.equal(listingAgePriority({postedAt},now),priority);
 assert.equal(listingAgeDays('invalid',now),null);assert.equal(listingAgeDays('2026-10-21',now),null);
 for(const postedAt of ['invalid','2026-10-21'])assert.ok(listingAgeBlocker({postedAt},now));
 assert.ok(listingAgeBlocker({postedAt:'2026-09-01'},now));assert.equal(listingAgeBlocker({postedAt:'2026-10-01'},now),null);
});
test('only verified public-sector closing dates waive old-listing cutoff',()=>{
 const p={postedAt:'2026-09-01',sourceKey:'edjoin:orange-schools',description:'Application closing date: 2026-10-21T23:00:00Z\nSupport role'};
 assert.equal(listingAgeBlocker(p,now),null);assert.equal(listingAgePriority(p,now),2);
 for(const changes of [{sourceKey:'greenhouse:test'},{description:'Application closing date: 2026-10-19T23:00:00Z'},{description:'Apply until filled'},{description:'Application closing date: invalid'}])assert.ok(listingAgeBlocker({...p,...changes},now));
});

test('application support scientist is not an IT support recommendation',async()=>{
 const{roleFamily,excludedTitle}=await import('../../src/lib/discovery/matching');
 assert.equal(excludedTitle('Application Support Scientist'),true);assert.equal(roleFamily('Application Support Scientist'),null);
 assert.equal(roleFamily('Application Support Analyst'),'core');
});
