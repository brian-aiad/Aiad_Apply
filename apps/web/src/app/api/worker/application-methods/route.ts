import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { workerAuthorized, WORKER_ID_PATTERN } from '@/lib/worker-security';
import { AUTOMATION_EVENT, readAttempt } from '@/lib/application-automation';
import { approvedMaterial, lockAutomation } from '@/lib/application-automation-store';

const KEY = 'application:portal-methods:v1';
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const origin = z.string().url().max(300).refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && value === url.origin; } catch { return false; }
});
const observation = z.object({version:z.literal(1),employerHash:hash,topOrigin:origin,frameOrigin:origin,formHash:hash,controlHash:hash,method:z.enum(['fill','select','choose'])}).strict();
const savedRecord = observation.extend({verifiedAt:z.string().datetime(),attemptId:z.string().uuid()}).strict();
const command = z.object({workerId:z.string().regex(WORKER_ID_PATTERN),attemptId:z.string().uuid(),claimToken:z.string().uuid(),observations:z.array(observation.extend({failed:z.boolean().optional()})).max(20).optional()}).strict();
export const runtime = 'nodejs';
export async function POST(request:Request) {
  if (!workerAuthorized(request)) return NextResponse.json({error:'Unauthorized.'},{status:401});
  const parsed = command.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({error:'Invalid method observation.'},{status:400});
  try {
    const records = await db.$transaction(async tx => {
      await lockAutomation(tx);
      const event = await tx.applicationEvent.findUnique({where:{id:parsed.data.attemptId},include:{application:{include:{job:true}}}});
      const attempt = event?.eventType === AUTOMATION_EVENT ? readAttempt(event.detail) : null;
      if (!event || !attempt || attempt.status !== 'RUNNING' || attempt.submissionStartedAt || attempt.workerId !== parsed.data.workerId || attempt.claimToken !== parsed.data.claimToken) throw Error('Attempt unavailable');
      await approvedMaterial(tx,event.applicationId,attempt);
      const employerHash = createHash('sha256').update(JSON.stringify(event.application.job.company.trim().toLowerCase())).digest('hex');
      const previous = await tx.setting.findUnique({where:{key:KEY}});
      const now = Date.now();
      let records = (Array.isArray(previous?.value) ? previous.value : []).flatMap(row => {
        const parsed = savedRecord.safeParse(row);
        if (!parsed.success) return [];
        const age = now-Date.parse(parsed.data.verifiedAt);
        return age >= 0 && age < 30*86400000 ? [parsed.data] : [];
      });
      for (const item of parsed.data.observations || []) {
        if (item.employerHash !== employerHash) throw Error('Employer scope mismatch');
        const {failed,...scope} = item;
        records = records.filter(old => !Object.entries(scope).every(([key,value]) => old[key as keyof typeof old] === value));
        if (!failed) records.push({...scope,verifiedAt:new Date(now).toISOString(),attemptId:event.id});
      }
      records = records.slice(-200);
      if (parsed.data.observations?.length) await tx.setting.upsert({where:{key:KEY},create:{key:KEY,value:records},update:{value:records}});
      return records.filter(row=>row.employerHash === employerHash);
    },{timeout:15000});
    return NextResponse.json({records},{headers:{'Cache-Control':'private, no-store'}});
  } catch { return NextResponse.json({error:'Portal learning unavailable; normal guarded application work may continue.'},{status:409}); }
}
