import test from 'node:test';
import assert from 'node:assert/strict';
import { verificationState, verificationReport } from '../../scripts/application-browser/verification.mjs';
const page = text => ({ frames: [{ text, controls: [] }] });
test('verification distinguishes rejection, explicit expiry and a requested code without inventing delivery', () => {
  assert.equal(verificationState(page('Enter the 8-character security code to confirm you are a human.')), 'required');
  assert.equal(verificationState(page('Enter the security code. Invalid security code')), 'rejected');
  assert.equal(verificationState(page('Enter the security code. Your security code has expired.')), 'expired');
  assert.equal(verificationState({ frames: [{ text: 'Enter code to continue. Invalid code.', controls: [{ tag: 'input', label: 'Code', autocomplete: 'one-time-code' }] }] }), 'rejected');
  assert.equal(verificationState(page('We build security code analyzers.')), null);
  assert.equal(verificationState(page('Thank you for applying. Your application was received.')), null);
  assert.match(verificationReport('rejected').summary, /cause is not established/);
  assert.match(verificationReport('required').summary, /delivery and submission are not confirmed/);
});
