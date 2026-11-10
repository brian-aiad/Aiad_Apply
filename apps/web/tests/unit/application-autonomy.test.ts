import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {autonomousFitBlockers,readAutonomy} from '../../src/lib/application-autonomy-policy';import {liveEligibilityBlockers} from '../../src/lib/application-autonomy-eligibility';
const fit={excluded:false,qualified:true,score:73,cautions:[],riskCount:0,notes:null,title:'Helpdesk Technician'};
test('standing authorization is explicit and factual, disputed pay and fit guards remain',()=>{
 assert.equal(readAutonomy({enabled:true}).enabled,false);assert.equal(readAutonomy({enabled:true,authorizationId:randomUUID(),authorizedAt:new Date().toISOString()}).enabled,true);assert.equal(autonomousFitBlockers(fit).length,0);
 for(const changes of [{excluded:true},{qualified:false},{riskCount:1},{score:50},{notes:'PAY VERIFICATION HOLD'},{title:'Platform Engineer II'},{cautions:['Required clearance missing']}])assert.ok(autonomousFitBlockers({...fit,...changes}).length);
 assert.equal(autonomousFitBlockers({...fit,cautions:['Work schedule: On-call.']}).length,0);
});
test('live proof requires starting pay, confirmed worksite, full time and a recent observation',()=>{
 const now=Date.now();const proof={sourceUrl:'https://jobs.example.com/123',evidenceText:'Job Type: Full-time\nWorksite: Long Beach, CA\nBase salary: $60,000 - $80,000 annually.',worksite:'Long Beach, CA',observedAt:new Date(now).toISOString()};const prefs={minimumSalary:60000,radiusMiles:30,includeRemote:false};assert.deepEqual(liveEligibilityBlockers(proof,prefs,now),[]);
 for(const changes of [{worksite:'Los Angeles County'},{worksite:'San Diego, CA'},{observedAt:new Date(now-31*60000).toISOString()},{evidenceText:proof.evidenceText.replace('$60,000','$50,000')},{evidenceText:proof.evidenceText.replace('Full-time','Contract')},{evidenceText:'Full-time in Long Beach, CA; salary not listed'}])assert.ok(liveEligibilityBlockers({...proof,...changes},prefs,now).length);
 assert.ok(liveEligibilityBlockers({...proof,evidenceText:'Full-time\nLong Beach, CA\nSalary: $5,148 - $6,414 per month\n11 months/year'},prefs,now).length);
});

test('only the repaired native-PDF preflight failure can retry once; export-allowed medium transfer is not an unresolved claim',async()=>{
 const {AUTONOMY_EXECUTION_VERSION,recoverableNativePdfFailure,unresolvedExportRisks}=await import('../../src/lib/application-autonomy-policy');const a={status:'BLOCKED',authorizationMode:'automatic',summary:'Could not read the approved resume for application answers.',runId:'run'};
 assert.equal(recoverableNativePdfFailure(a,'run'),true);
 for(const change of [{status:'UNKNOWN'},{submissionStartedAt:new Date().toISOString()},{browserStartedAt:new Date().toISOString()},{executionVersion:AUTONOMY_EXECUTION_VERSION},{technicalRetryCount:1},{summary:'Employer requires login.'},{authorizationMode:'manual'}])assert.equal(recoverableNativePdfFailure({...a,...change},'run'),false);
 assert.equal(unresolvedExportRisks({claim_risks:[{export_allowed:true,risk_level:'medium',strength:'strongly_transferable'}]},1),0);
 assert.equal(unresolvedExportRisks({claim_risks:[{export_allowed:false,risk_level:'medium'}]},1),1);
 assert.equal(unresolvedExportRisks({claim_risks:[{export_allowed:true,risk_level:'high'}]},1),1);
 assert.equal(unresolvedExportRisks({},1),1);
});

test('native Codex repair retries only before live verification or personal uploads',async()=>{
 const {recoverableNativePdfFailure}=await import('../../src/lib/application-autonomy-policy');const a={status:'BLOCKED',authorizationMode:'automatic',summary:'The Codex executable was not found. Repair the local worker PATH or Codex executable setting.',runId:'run',executionVersion:'2026-10-20-native-pdf-v1',technicalRetryCount:1,browserStartedAt:new Date().toISOString()};
 assert.equal(recoverableNativePdfFailure(a,'run'),true);
 for(const change of [{liveEligibility:{}},{uploadedResumeVerified:true},{submissionStartedAt:new Date().toISOString()},{technicalRetryCount:2},{summary:'Login required'}])assert.equal(recoverableNativePdfFailure({...a,...change},'run'),false);
});

test('access-only stops do not exhaust application budget or authorize their retry',async()=>{
 const {countsTowardAutonomyLimit}=await import('../../src/lib/application-autonomy-policy');
 const a={authorizationMode:'automatic',status:'BLOCKED'};
 assert.equal(countsTowardAutonomyLimit(a),false);
 for(const c of [{status:'RUNNING'},{submissionStartedAt:'2026-10-20T00:00:00Z'},{liveEligibility:{}},{uploadedResumeVerified:true}])assert.equal(countsTowardAutonomyLimit({...a,...c}),true);
 assert.equal(countsTowardAutonomyLimit({...a,status:'RUNNING',authorizationMode:'manual'}),false);
});

test('numbered street names cannot create a false second worksite',async()=>{
 const {localDistance}=await import('../../src/lib/discovery/matching');
 assert.equal(localDistance('6700 East Carson Street, Long Beach, CA 90808'),localDistance('Long Beach, CA'));
 assert.equal(localDistance('123 Long Beach Boulevard, Carson, CA'),localDistance('Carson, CA'));
 assert.equal(localDistance('6700 East Carson Street, Long Beach, CA; Irvine, CA'),null);
 assert.equal(localDistance('Long Beach and Carson, CA'),null);
 const {recoverableNativePdfFailure,AUTONOMY_EXECUTION_VERSION}=await import('../../src/lib/application-autonomy-policy');
 const a={status:'BLOCKED',authorizationMode:'automatic',summary:'Live worksite is not confirmed within the saved radius.',runId:'r',executionVersion:'2026-10-20-native-launch-v2',browserStartedAt:'2026-10-20T00:00:00Z'};
 assert.equal(recoverableNativePdfFailure(a,'r'),true);
 for(const c of [{executionVersion:AUTONOMY_EXECUTION_VERSION},{technicalRetryCount:1},{liveEligibility:{}},{uploadedResumeVerified:true},{submissionStartedAt:'2026-10-20T00:00:00Z'}])assert.equal(recoverableNativePdfFailure({...a,...c},'r'),false);
});

test('verified zero-action repair cannot retry a filled, uploaded or uncertain attempt',async()=>{
 const {recoverableNativePdfFailure,AUTONOMY_EXECUTION_VERSION}=await import('../../src/lib/application-autonomy-policy');
 const a={status:'BLOCKED',authorizationMode:'automatic',summary:'No supported next action was available.',runId:'r',executionVersion:'2026-10-20-worksite-address-v3',technicalRetryCount:1,liveEligibility:{},questions:[]};
 assert.equal(recoverableNativePdfFailure(a,'r'),true);
 for(const c of [{executionVersion:AUTONOMY_EXECUTION_VERSION},{technicalRetryCount:2},{questions:[{}]},{uploadedResumeVerified:true},{submissionStartedAt:'2026-10-20T00:00:00Z'}])assert.equal(recoverableNativePdfFailure({...a,...c},'r'),false);
});

test('custom-control retry is bounded to the exact repaired no-data failure',async()=>{
 const {recoverableNativePdfFailure,AUTONOMY_EXECUTION_VERSION}=await import('../../src/lib/application-autonomy-policy');
 const a={status:'BLOCKED',authorizationMode:'automatic',summary:'The correct job is visible, but “Apply for this Position” has no actionable control reference in the snapshot.',runId:'r',executionVersion:'2026-10-20-verification-step-v4',technicalRetryCount:2,liveEligibility:{},questions:[]};
 assert.equal(recoverableNativePdfFailure(a,'r'),true);
 for(const c of [{executionVersion:AUTONOMY_EXECUTION_VERSION},{technicalRetryCount:3},{questions:[{}]},{uploadedResumeVerified:true},{submissionStartedAt:'2026-10-20T00:00:00Z'}])assert.equal(recoverableNativePdfFailure({...a,...c},'r'),false);
});

test('qualification verification hold parks only the affected application',()=>{
 const fit={excluded:false,qualified:true,score:89,cautions:[],riskCount:0,notes:null,title:'IT Support Specialist'};
 assert.deepEqual(autonomousFitBlockers(fit),[]);
 assert.deepEqual(autonomousFitBlockers({...fit,notes:'QUALIFICATION VERIFICATION HOLD: computer imaging not confirmed.'}),['A required qualification is awaiting factual confirmation.']);
});
