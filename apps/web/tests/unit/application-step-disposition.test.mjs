import test from 'node:test';import assert from 'node:assert/strict';import{stepDisposition}from '../../scripts/application-browser/step-disposition.mjs';
test('verification-only step observes again; an unexplained empty plan still fails',()=>{
 assert.equal(stepDisposition({outcome:'continue',actions:[]},true),'observe');
 assert.throws(()=>stepDisposition({outcome:'continue',actions:[]}),/No supported/);
 assert.equal(stepDisposition({outcome:'continue',actions:[{kind:'fill'}]},true),'execute');
 assert.equal(stepDisposition({outcome:'blocked',actions:[]},true),'blocked');
 assert.equal(stepDisposition({outcome:'confirmation',actions:[]},true),'confirmation');
 assert.throws(()=>stepDisposition({outcome:'continue',actions:Array(101).fill({})},true),/No supported/);
});
