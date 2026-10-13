import test from 'node:test';
import assert from 'node:assert/strict';
import { finishBrowserResult } from '../../scripts/application-browser/final-result.mjs';
test('confirmed receipt supersedes stale waiting diagnostics without dropping question history', () => {
 const driver={questions:[{question:'Email',answer:'test@example.com'}],unresolved:['Receipt not visible yet']};
 const receipt={status:'SUBMITTED',confirmation:'Your application has been received.',confirmationUrl:'https://example.com/confirmation',screenshot:'/private/confirmation.png'};
 const final=finishBrowserResult(receipt,driver);
 assert.deepEqual(final.unresolved,[]);assert.deepEqual(final.questions,driver.questions);assert.equal(final.confirmation,receipt.confirmation);
 assert.deepEqual(driver.unresolved,['Receipt not visible yet']);
});
test('unconfirmed results retain their specific errors rather than replacing them with stale driver state', () => {
 const driver={questions:[],unresolved:['Older dropdown issue']};
 assert.deepEqual(finishBrowserResult({status:'UNKNOWN',unresolved:['Email connection unavailable']},driver).unresolved,['Email connection unavailable']);
 assert.deepEqual(finishBrowserResult({status:'BLOCKED'},driver).unresolved,driver.unresolved);
});
