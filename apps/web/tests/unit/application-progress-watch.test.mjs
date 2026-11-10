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

test('committed custom radio and checkbox answers count as progress',()=>{
 for(const role of ['radio','checkbox']){
  const watch=new ProgressWatch();
  const snapshot=filled=>({url:'https://example.com/form',frames:[{url:'https://example.com/form',controls:Array.from({length:10},(_,i)=>({tag:i%2?'div':'button',role,label:`Question ${i}`,checked:i<filled,value:''}))}]});
  assert.equal(watch.observe(snapshot(0)),0);
  for(let filled=1;filled<=10;filled++)assert.equal(watch.observe(snapshot(filled)),0);
  assert.equal(watch.observe(snapshot(10)),1);
 }
});
test('custom combobox tracks committed value but not menu state or search text',()=>{
 const watch=new ProgressWatch();
 const snapshot=(value,expanded,searchText)=>({url:'https://example.com/form',frames:[{url:'https://example.com/form',controls:[{tag:'button',role:'combobox',label:'Degree',value,expanded,searchText}]}]});
 assert.equal(watch.observe(snapshot('',false,'')),0);
 assert.equal(watch.observe(snapshot('',true,'Bach')),1);
 assert.equal(watch.observe(snapshot('Bachelor',false,'')),0);
});
