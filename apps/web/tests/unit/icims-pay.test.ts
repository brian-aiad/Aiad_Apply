import assert from 'node:assert/strict';
import test from 'node:test';
import {payFromText} from '../../src/lib/discovery/normalization';
import {liveEligibilityBlockers} from '../../src/lib/application-autonomy-eligibility';

const band = 'Min USD $88,000.00/Yr. Max USD $92,000.00/Yr.';
test('complete iCIMS annual USD band passes live eligibility', () => {
  assert.equal(payFromText(band).salaryMin, 88000);
  assert.equal(payFromText(band).salaryMax, 92000);
  const now = Date.now();
  assert.deepEqual(liveEligibilityBlockers({sourceUrl:'https://careers-cordobacorp.icims.com/jobs/2898/it-technical-support/job', evidenceText:`IT Technical Support\nUS-CA-Los Angeles\nPosition Type Regular Full-Time ${band}`,worksite:'US-CA-Los Angeles',observedAt:new Date(now).toISOString()}, {minimumSalary:60000,radiusMiles:30,includeRemote:false},now), []);
});
test('iCIMS parsing preserves incomplete, currency, period and ambiguity guards', () => {
  for (const value of [band.replace('Max USD','Max CAD'),band.replaceAll('USD','CAD'),band.replace('88,000','98,000'),band.replace(' Max USD $92,000.00/Yr.',''),band.replace('/Yr.','/Hr.'),`${band} Base salary $70,000 - $80,000/year`]) {
    assert.equal(payFromText(value).salaryMin,null,value);
  }
  assert.equal(payFromText(band.replace('88,000','58,000')).salaryMin,58000);
});
