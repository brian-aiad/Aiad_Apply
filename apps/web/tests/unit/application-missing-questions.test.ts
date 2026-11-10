import test from 'node:test';
import assert from 'node:assert/strict';
import {missingCandidateQuestions} from '../../src/lib/application-automation';
test('access and diagnostics never become candidate answer fields',()=>{
 const questions=[
  {question:'Sign in to continue',answer:'',source:'unanswered' as const},
  {question:'Complete CAPTCHA',answer:'',source:'unanswered' as const},
  {question:'Enter your security code',answer:'',source:'unanswered' as const},
  {question:'How many hours per week did you work?',answer:'',source:'unanswered' as const},
  {question:'Exact option wording is unavailable',answer:'',source:'unanswered' as const},
  {question:'Are you authorized to work?',answer:'Yes',source:'saved_profile' as const},
 ];
 assert.deepEqual(missingCandidateQuestions({questions}),['How many hours per week did you work?']);
 assert.deepEqual(missingCandidateQuestions({questions:questions.slice(0,3)}),[]);
});
test('actual experience questions containing access terminology remain answerable',()=>{
 const terms=['Describe your design integration experience','Do you have experience troubleshooting login issues?','What catalog information did you maintain?'];
 assert.deepEqual(missingCandidateQuestions({questions:terms.map(question=>({question,answer:'',source:'unanswered'}))}),terms);
});
