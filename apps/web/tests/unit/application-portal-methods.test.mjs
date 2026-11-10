import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedMethodObservation, applicableMethodHints } from '../../scripts/application-browser/portal-methods.mjs';
const job = {company:'Fixture Employer'};
const snapshot = (value='',ref='old') => ({url:'https://ats.example/jobs/1?private=query',frames:[{url:'https://ats.example/jobs/1?private=query',controls:[{ref,tag:'input',type:'email',role:'',label:'Email',context:'Contact',value,required:true}]}]});
const before=snapshot(),after=snapshot('private@example.com','new');
test('learning stores methods only and resolves regenerated references from current structure',()=>{
 const observation=verifiedMethodObservation(job,before,after,'old','fill');
 assert.ok(observation);
 const encoded=JSON.stringify(observation);
 for(const privateText of ['private@example.com','Email','Contact','old','new','private=query','jobs/1'])assert.ok(!encoded.includes(privateText));
 const record={...observation,verifiedAt:new Date().toISOString()};
 assert.deepEqual(applicableMethodHints(job,snapshot('','fresh'),[record]),[{ref:'fresh',method:'fill'}]);
 for(const changed of [{company:'Other Employer'}])assert.deepEqual(applicableMethodHints(changed,before,[record]),[]);
 for(const changed of [{version:2},{formHash:'0'.repeat(64)},{topOrigin:'https://other.example'},{failed:true},{verifiedAt:new Date(Date.now()-31*86400000).toISOString()},{verifiedAt:new Date(Date.now()+86400000).toISOString()}])assert.deepEqual(applicableMethodHints(job,before,[{...record,...changed}]),[]);
});
test('no-op, unsafe actions, sensitive fields and ambiguous structures produce no learning',()=>{
 assert.equal(verifiedMethodObservation(job,before,snapshot('','new'),'old','fill'),null);
 for(const method of ['click','check','upload','submit'])assert.equal(verifiedMethodObservation(job,before,after,'old',method),null);
 for(const label of ['Password','Verification code','Consent','Gender','Signature']){
  const a=snapshot(),b=snapshot('secret');a.frames[0].controls[0].label=label;b.frames[0].controls[0].label=label;
  assert.equal(verifiedMethodObservation(job,a,b,'old','fill'),null);
 }
 const repeated=snapshot();repeated.frames[0].controls.push({...repeated.frames[0].controls[0],ref:'other'});
 assert.equal(verifiedMethodObservation(job,repeated,after,'old','fill'),null);
 const moved=snapshot('answer');moved.url='https://ats.example/jobs/2';
 assert.equal(verifiedMethodObservation(job,before,moved,'old','fill'),null);
});

test('failed controls invalidate only their structural method scope',async()=>{
 const {failedMethodObservation}=await import('../../scripts/application-browser/portal-methods.mjs');
 const failed=failedMethodObservation(job,before,'old','fill');
 assert.equal(failed.failed,true);
 assert.equal(failed.method,'fill');
 assert.ok(!JSON.stringify(failed).includes('Email'));
 assert.equal(failedMethodObservation(job,before,'old','submit'),null);
});

test('form executor learns only after verified action and isolates telemetry failure',async()=>{
 const {executeFormPlan}=await import('../../scripts/application-browser/form-plan.mjs');
 const makeDriver=()=>{
  const frame={url:()=>before.url,isDetached:()=>false};
  const driver={job,lastSnapshot:snapshot(),refs:new Map(),ref(ref){return this.refs.get(ref);},async snapshot(){this.refs=new Map(this.lastSnapshot.frames[0].controls.map(control=>[control.ref,{control,frame}]));return this.lastSnapshot;},async act(){this.lastSnapshot=snapshot('private@example.com','updated');}};
  return driver;
 };
 const driver=makeDriver();await driver.snapshot();
 const observations=[];
 await executeFormPlan(driver,[{kind:'fill',ref:'old',value:'private@example.com'}],o=>observations.push(o));
 assert.equal(observations.length,1);assert.equal(observations[0].method,'fill');
 const failingTelemetry=makeDriver();await failingTelemetry.snapshot();
 await executeFormPlan(failingTelemetry,[{kind:'fill',ref:'old',value:'private@example.com'}],()=>{throw Error('learning unavailable');});
 assert.equal(failingTelemetry.lastSnapshot.frames[0].controls[0].value,'private@example.com');
 const failed=makeDriver();await failed.snapshot();failed.act=async()=>{throw Error('control changed');};
 const failures=[];
 await assert.rejects(executeFormPlan(failed,[{kind:'fill',ref:'old',value:'private@example.com'}],o=>failures.push(o)),/control changed/);
 assert.equal(failures[0].failed,true);
});

test('local invalidation removes a failed hint without depending on persistence',async()=>{
 const {failedMethodObservation,withoutFailedMethods}=await import('../../scripts/application-browser/portal-methods.mjs');
 const record={...verifiedMethodObservation(job,before,after,'old','fill'),verifiedAt:new Date().toISOString()};
 const failed=failedMethodObservation(job,before,'old','fill');
 assert.equal(applicableMethodHints(job,before,[record]).length,1);
 const remaining=withoutFailedMethods([record],failed);
 assert.deepEqual(applicableMethodHints(job,before,remaining),[]);
 assert.equal(withoutFailedMethods([record],{...failed,formHash:'0'.repeat(64)}).length,1);
});
