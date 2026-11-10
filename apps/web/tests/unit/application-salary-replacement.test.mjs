import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedZeroSalaryReplacement as replace} from '../../scripts/application-browser/driver.mjs';
test('only an exact job-scoped confirmed salary replacement can replace zero',()=>{
 const c={label:'What are your salary requirements?',value:'$ 0'};
 const a=[{question:c.label,answer:'$70,000 annually. Replace the $0 default.'}];
 assert.equal(replace(c,'70000',a),true);
 assert.equal(replace(c,'70000',[]),false);
 assert.equal(replace(c,'90000',a),false);
 assert.equal(replace({...c,value:'60000'},'70000',a),false);
 assert.equal(replace({...c,label:'Years of experience'},'70000',a),false);
 assert.equal(replace(c,'70,000 monthly',a),false);
});

test('date picker immediate suffix repair preserves the exact valid date',async()=>{
 const {repairImmediateDate:repair}=await import('../../scripts/application-browser/driver.mjs');
 const c={label:'Earliest start date',value:'10/26/2026Immediately'};
 assert.equal(repair(c,'10/26/2026'),true);
 assert.equal(repair(c,'11/01/2026'),false);
 assert.equal(repair({...c,label:'Other answer'},'10/26/2026'),false);
 assert.equal(repair({...c,value:'02/30/2026Immediately'},'02/30/2026'),false);
});
