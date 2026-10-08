import test from 'node:test';import assert from 'node:assert/strict';
import {ProgressWatch} from '../../scripts/application-browser/progress-watch.mjs';
test('progress watch detects alternating menus and resets only for committed progress',()=>{
 const p=new ProgressWatch();
 const snap=(value,ref,expanded)=>({url:'https://example.com/job',resumeUploaded:true,submissionStarted:false,frames:[{url:'https://example.com/job',controls:[{tag:'input',role:'combobox',label:'Degree',value,ref,expanded,searchText:'filter'}]}]});
 assert.equal(p.observe(snap('','a',true)),0);
 assert.equal(p.observe(snap('','b',false)),1);
 assert.equal(p.observe(snap('','c',true)),2);
 assert.equal(p.observe(snap('Bachelor','d',false)),0);
});
