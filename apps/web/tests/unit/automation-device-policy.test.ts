import test from 'node:test';import assert from 'node:assert/strict';
import {automationPlatformAllowed as allowed,selectedAutomationPlatform as selected} from '../../src/lib/automation-device-policy';
test('application override leaves discovery on Windows and retains legacy fallback',()=>{
 const legacy={browserPlatform:'win32'};
 assert.equal(allowed(legacy,'win32','applications'),true);assert.equal(allowed(legacy,'darwin','applications'),false);
 const split={...legacy,applicationPlatform:'darwin'};
 assert.equal(allowed(split,'win32'),true);assert.equal(allowed(split,'darwin'),false);
 assert.equal(allowed(split,'darwin','applications'),true);assert.equal(allowed(split,'win32','applications'),false);
 assert.equal(selected(split,'applications'),'darwin');assert.equal(selected(split),'win32');
});
