import "dotenv/config";
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { assertIsolatedDatabase } from "../../src/lib/test-database";
const url = process.env.AIADAPPLY_E2E_DATABASE_URL;
if (!url) throw new Error("An isolated database is required.");
assertIsolatedDatabase(url, process.env.DATABASE_URL || "postgresql://localhost/unknown");
process.env.DATABASE_URL = url; process.env.DIRECT_URL = process.env.AIADAPPLY_E2E_DIRECT_URL || url;
process.env.WORKER_SECRET = "workspace-fixture-only";
let db: import("@prisma/client").PrismaClient;
const keys = ["workspace:candidate-profile", "workspace:base-resume", "workspace:onboarding", "workspace:automation"];
const originals = new Map<string, object>();
before(async () => { db = (await import("../../src/lib/db")).db; for (const row of await db.setting.findMany({ where: { key: { in: keys } } })) originals.set(row.key, row.value as object); });
after(async () => { for (const key of keys) { const value = originals.get(key); if (value) await db.setting.upsert({ where:{key}, create:{key,value:JSON.parse(JSON.stringify(value))}, update:{value:JSON.parse(JSON.stringify(value))} }); else await db.setting.deleteMany({where:{key}}); } await db.$disconnect(); });
test("evidence decisions are shared, concurrent updates survive, and local candidate file is unchanged", async () => {
  // Resolve from web cwd: tests never overwrite source candidate data.
  const path = process.cwd() + "/../../data/profile/Brian_Aiad_PROFILE.json";
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const before = hash(await readFile(path));
  await db.setting.upsert({ where:{key:keys[0]}, create:{key:keys[0],value:{confirmed_skills:[]}}, update:{value:{confirmed_skills:[]}} });
  const { PATCH } = await import("../../src/app/api/profile/evidence/route");
  const save = (term:string) => PATCH(new Request("http://localhost/api/profile/evidence", {method:"PATCH",body:JSON.stringify({term,category:"technology",decision:"confirmed",scope:"skills_only"})}));
  assert.ok((await Promise.all([save("Fixture A"),save("Fixture B")])).every(r=>r.ok));
  const profile = (await db.setting.findUniqueOrThrow({where:{key:keys[0]}})).value as {confirmed_skills:string[]};
  assert.deepEqual([...profile.confirmed_skills].sort(),["Fixture A","Fixture B"]);
  assert.equal(hash(await readFile(path)),before);
});
test("worker material requires a secret and returns byte-verified shared source instead of device defaults", async () => {
  const bytes=Buffer.from("isolated-base");
  const value={contentBase64:bytes.toString("base64"),byteSize:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")};
  await db.setting.upsert({where:{key:keys[1]},create:{key:keys[1],value},update:{value}});
  const { POST } = await import("../../src/app/api/worker/material/route");
  assert.equal((await POST(new Request("http://localhost/api/worker/material",{method:"POST"}))).status,401);
  const result=await POST(new Request("http://localhost/api/worker/material",{method:"POST",headers:{authorization:"Bearer workspace-fixture-only"}}));
  assert.equal((await result.json()).baseResume.sha256,value.sha256);
});
test("only the chosen browser platform can claim approved work", async () => {
  await db.setting.upsert({where:{key:keys[3]},create:{key:keys[3],value:{browserPlatform:"win32"}},update:{value:{browserPlatform:"win32"}}});
  const { POST } = await import("../../src/app/api/worker/applications/route");
  const result=await POST(new Request("http://localhost/api/worker/applications",{method:"POST",headers:{authorization:"Bearer workspace-fixture-only"},body:JSON.stringify({action:"claim",workerId:"mac-fixture",platform:"darwin"})}));
  assert.equal(result.status,204);
});

test("generic status changes require confirmation and stale-device edits cannot overwrite notes", async () => {
  const { randomUUID } = await import("node:crypto");
  const paste = "workspace-guard-" + randomUUID();
  const job = await db.job.create({data:{company:"Fixture",title:"Support",rawPaste:paste,rawPasteSha256:createHash("sha256").update(paste).digest("hex"),application:{create:{}}},include:{application:true}});
  const app=job.application!;
  try {
    const { PATCH }=await import("../../src/app/api/applications/[id]/route");
    const update=(body:unknown)=>PATCH(new Request(`http://localhost/api/applications/${app.id}`,{method:"PATCH",body:JSON.stringify(body)}),{params:Promise.resolve({id:app.id})});
    assert.equal((await update({status:"APPLIED"})).status,409);
    await db.application.update({where:{id:app.id},data:{notes:"Other device saved this"}});
    assert.equal((await update({updatedAt:app.updatedAt.toISOString(),notes:"Stale draft"})).status,409);
    assert.equal((await db.application.findUniqueOrThrow({where:{id:app.id}})).notes,"Other device saved this");
  } finally {await db.job.delete({where:{id:job.id}});}
});

test("a Windows tailoring worker is told to start the browser only when approved work is queued", async () => {
  const { randomUUID }=await import("node:crypto");
  const paste="startup-fixture-"+randomUUID();
  const job=await db.job.create({data:{company:"Startup Fixture",title:"Support",rawPaste:paste,rawPasteSha256:createHash("sha256").update(paste).digest("hex"),application:{create:{events:{create:{eventType:"application_automation",toValue:"QUEUED",detail:{fixture:true}}}}}},include:{application:true}});
  const prior=await db.setting.findUnique({where:{key:"application-browser:heartbeat"}});
  await db.setting.deleteMany({where:{key:"application-browser:heartbeat"}});
  try {
    const { POST }=await import("../../src/app/api/worker/browser-start/route");
    const request=(platform:string)=>POST(new Request("http://localhost/api/worker/browser-start",{method:"POST",headers:{authorization:"Bearer workspace-fixture-only"},body:JSON.stringify({workerId:"startup-fixture-worker",platform})}));
    assert.equal((await (await request("darwin")).json()).start,false);
    assert.equal((await (await request("win32")).json()).start,true);
  } finally {
    await db.job.delete({where:{id:job.id}});
    await db.setting.deleteMany({where:{key:"worker:heartbeat:startup-fixture-worker"}});
    if(prior)await db.setting.upsert({where:{key:prior.key},create:{key:prior.key,value:JSON.parse(JSON.stringify(prior.value))},update:{value:JSON.parse(JSON.stringify(prior.value))}});
  }
});


test("scheduled employer collection cannot run from a secondary device", { skip: process.platform === "win32" }, async () => {
  await db.setting.upsert({where:{key:keys[3]},create:{key:keys[3],value:{browserPlatform:"win32"}},update:{value:{browserPlatform:"win32"}}});
  const { POST } = await import("../../src/app/api/worker/discovery/route");
  const response = await POST(new Request("http://localhost/api/worker/discovery",{method:"POST",headers:{authorization:"Bearer workspace-fixture-only"},body:"{}"}));
  assert.equal((await response.json()).status,"other_device");
});
