import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationIdentity } from '../../src/lib/application-history';

test('iCIMS display parameters preserve exact tenant and job identity', () => {
 const url='https://careers-example.icims.com/jobs/2898/it-technical-support/job';
 assert.equal(applicationIdentity(url),applicationIdentity(url+'?mobile=false&width=1127&height=500&bga=true&needsRedirect=false&jan1offset=-480&jun1offset=-420'));
 assert.notEqual(applicationIdentity(url),applicationIdentity(url.replace('/2898/','/2899/')));
 assert.notEqual(applicationIdentity(url),applicationIdentity(url.replace('careers-example','careers-other')));
 assert.notEqual(applicationIdentity(url),applicationIdentity(url+'?jobId=2899'));
 assert.notEqual(applicationIdentity('https://example.com/jobs/2898/role/job'),applicationIdentity('https://example.com/jobs/2898/role/job?mobile=true'));
});
