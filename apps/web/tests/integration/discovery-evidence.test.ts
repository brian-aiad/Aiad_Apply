import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {assertIsolatedDatabase} from '../../src/lib/test-database';
const url=process.env.AIADAPPLY_E2E_DATABASE_URL;
if(!url)throw Error('Isolated database required');
assertIsolatedDatabase(url,process.env.DATABASE_URL||'postgresql://localhost/unknown');
process.env.DATABASE_URL=url;process.env.DIRECT_URL=process.env.AIADAPPLY_E2E_DIRECT_URL||url;
test('hosted evidence uses shared extraction without Python and rejects changed source',async()=>{
 const {db}=await import('../../src/lib/db');
 const {BASE_RESUME_KEY}=await import('../../src/lib/workspace-material');
 const {currentDiscoveryEvidence,INSPECTION_KEY,DiscoveryEvidenceUnavailable}=await import('../../src/lib/discovery/current-evidence');
 const keys=[BASE_RESUME_KEY,INSPECTION_KEY];
 const previous=await db.setting.findMany({where:{key:{in:keys}}});
 const original=process.cwd();const folder=await mkdtemp(path.join(tmpdir(),'aiad-hosted-evidence-'));
 const base=(text:string)=>{const bytes=Buffer.from(text);return{contentBase64:bytes.toString('base64'),byteSize:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};};
 try{
  const first=base('isolated source bytes');
  const paragraph={id:'experience.fixture.bullet.1',section:'experience.fixture',kind:'bullet',text:'Maintained incident records and trained staff.'};
  await db.setting.upsert({where:{key:BASE_RESUME_KEY},create:{key:BASE_RESUME_KEY,value:first},update:{value:first}});
  const snapshot={version:1,extractor:'protected-docx-parser-v1',sha256:first.sha256,extractedAt:new Date().toISOString(),paragraphs:[paragraph]};
  await db.setting.upsert({where:{key:INSPECTION_KEY},create:{key:INSPECTION_KEY,value:snapshot},update:{value:snapshot}});
  process.chdir(folder);
  assert.deepEqual((await currentDiscoveryEvidence({})).evidence,[paragraph.text]);
  await db.setting.update({where:{key:BASE_RESUME_KEY},data:{value:base('changed bytes')}});
  await assert.rejects(currentDiscoveryEvidence({}),DiscoveryEvidenceUnavailable);
 }finally{
  process.chdir(original);await rm(folder,{recursive:true,force:true});
  await db.setting.deleteMany({where:{key:{in:keys}}});
  for(const saved of previous)await db.setting.create({data:{key:saved.key,value:saved.value!}});
  await db.$disconnect();
 }
});
