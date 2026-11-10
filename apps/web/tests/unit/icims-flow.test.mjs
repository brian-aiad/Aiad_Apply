import assert from 'node:assert/strict';
import test from 'node:test';
import {sameIcimsJobFlow} from '../../scripts/application-browser/driver.mjs';
test('iCIMS title-free flow requires prior identity and exact tenant and requisition for page and target frame', () => {
  const bound = 'https://careers-example.icims.com/jobs/2898/it-support/job';
  const login = 'https://careers-example.icims.com/jobs/2898/login?mobile=false';
  assert.equal(sameIcimsJobFlow(bound,[bound,login],true),true);
  assert.equal(sameIcimsJobFlow(bound,[bound,login],false),false);
  for (const changed of [login.replace('2898','2899'),login.replace('careers-example','careers-other'),login.replace('https:','http:'),'https://careers-example.icims.com/connect','about:blank','https://careers-example.icims.com.evil.test/jobs/2898/login']) {
    assert.equal(sameIcimsJobFlow(bound,[bound,changed],true),false,changed);
    assert.equal(sameIcimsJobFlow(bound,[changed,login],true),false,changed);
  }
  assert.equal(sameIcimsJobFlow(bound,[],true),false);
  assert.equal(sameIcimsJobFlow('https://other.test/jobs/2898/job',[login],true),false);
});
