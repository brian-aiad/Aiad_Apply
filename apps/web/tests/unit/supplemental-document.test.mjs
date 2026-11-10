import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import{createHash}from'node:crypto';import{loadCoverLetter}from'../../scripts/application-browser/supplemental-document.mjs';
test('cover letter manifest binds job resume destination and authorization with exact bytes',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'cover-binding-'));t.after(()=>rm(root,{recursive:true,force:true}));const runtime=path.join(root,'.runtime');await mkdir(path.join(runtime,'application-documents'),{recursive:true});
 const job={applicationId:'fixture',runId:'run',resumeSha256:'resume',destination:'https://employer.test/job',authorizationId:'standing'};
 assert.equal(await loadCoverLetter(root,job),null);
 const bytes=Buffer.from('%PDF-1.4\nletter'),file=path.join(runtime,'letter.pdf');await writeFile(file,bytes);
 const entry={...job,path:file,sha256:createHash('sha256').update(bytes).digest('hex')};await writeFile(path.join(runtime,'application-documents/fixture.json'),JSON.stringify(entry));
 assert.equal((await loadCoverLetter(root,job)).sha256,entry.sha256);
 for(const field of ['runId','resumeSha256','destination','authorizationId'])await assert.rejects(loadCoverLetter(root,{...job,[field]:'different'}),/authorization/);
 await writeFile(file,'changed');await assert.rejects(loadCoverLetter(root,job),/bytes changed/);
});
