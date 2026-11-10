import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationContext } from '../../scripts/application-browser/context.mjs';

test('browser context withholds unrelated sensitive details and keeps observed questions/facts', () => {
  const input = { job:{company:'Fixture'}, profile:{email:'fixture@example.test'}, setup:{citizenship:'confirmed', dateOfBirth:'private',selfReportedDemographics:{gender:'private'},andurilFormAnswers:{private:true}}, snapshot:{frames:[{text:'Name and phone',controls:[{ref:'1',label:'Phone',value:''}]}]} };
  const result=applicationContext(input);
  assert.equal(result.setup.citizenship,'confirmed'); assert.equal(result.setup.dateOfBirth,undefined); assert.equal(result.setup.andurilFormAnswers,undefined);
  assert.deepEqual(result.snapshot.frames[0].controls,input.snapshot.frames[0].controls);
  assert.equal(applicationContext({...input,snapshot:{frames:[{text:'Date of birth',controls:[]}]}}).setup.dateOfBirth,'private');
});


test('prior employer facts are retained when that question is visible, without resending unrelated history',()=>{
  const context={job:{company:'Fixture'}, setup:{employerHistoryDefault:'Confirmed factual history'},snapshot:{frames:[{text:'Have you previously worked for this company?',controls:[]}]}};
  assert.equal(applicationContext(context).setup.employerHistoryDefault,'Confirmed factual history');
  assert.equal(applicationContext({...context,snapshot:{frames:[{text:'Contact email',controls:[]}]}}).setup.employerHistoryDefault,undefined);
});

 test('confirmed employment dates are available for history fields only',()=>{
  const employmentHistory={fixture:{startDate:'2024-06-15',endDate:null,currentEmployer:true}};
  const input={setup:{employmentHistory},snapshot:{frames:[{text:'Employment history: current employer, start date, end date',controls:[]}]}};
  assert.deepEqual(applicationContext(input).setup.employmentHistory,employmentHistory);
  assert.equal(applicationContext({...input,snapshot:{frames:[{text:'Contact email',controls:[]}]}}).setup.employmentHistory,undefined);
 });

 test('professional references are available only for reference questions with explicit contact permission',()=>{
  const professionalReferences=[{name:'Fixture Reference',email:'reference@example.test',mayContact:true}];
  const input={setup:{professionalReferences},snapshot:{frames:[{text:'Professional references: name, email, may we contact?',controls:[]}]}};
  assert.deepEqual(applicationContext(input).setup.professionalReferences,professionalReferences);
  assert.equal(applicationContext({...input,snapshot:{frames:[{text:'Contact information',controls:[]}]}}).setup.professionalReferences,undefined);
 });
