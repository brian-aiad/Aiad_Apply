import test from 'node:test';import assert from 'node:assert/strict';
import {refreshRequestFinished} from '../../src/lib/discovery/refresh-request';
test('manual scan waits through freshness/running and consumes terminal failure once',()=>{
 assert.equal(refreshRequestFinished({reason:'fresh',scan:{status:'completed'}}),false);
 assert.equal(refreshRequestFinished({reason:'running',scan:{status:'running'}}),false);
 assert.equal(refreshRequestFinished({scan:{status:'completed'}}),true);
 assert.equal(refreshRequestFinished({scan:{status:'failed'}}),true);
});
