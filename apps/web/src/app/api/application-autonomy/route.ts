import {randomUUID} from 'node:crypto';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/lib/db';
import {AUTONOMY_KEY,readAutonomy} from '@/lib/application-autonomy-policy';
import {crossOriginMutation} from '@/lib/web-url';
import {lockAutomation} from '@/lib/application-automation-store';
export async function GET(){const [settings,state]=await Promise.all([db.setting.findUnique({where:{key:AUTONOMY_KEY}}),db.setting.findUnique({where:{key:'application:autonomy-state'}})]);return NextResponse.json({settings:readAutonomy(settings?.value),state:state?.value??null},{headers:{'Cache-Control':'private,no-store'}});}
export async function POST(request:Request){
 if(crossOriginMutation(request))return NextResponse.json({error:'Cross-origin changes are not allowed.'},{status:403});
 const input=z.object({enabled:z.boolean(),dailyLimit:z.number().int().min(1).max(10).optional()}).safeParse(await request.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Choose automatic application settings.'},{status:400});
 const settings=await db.$transaction(async tx=>{await lockAutomation(tx);const previous=readAutonomy((await tx.setting.findUnique({where:{key:AUTONOMY_KEY}}))?.value);const value={enabled:input.data.enabled,dailyLimit:input.data.dailyLimit??previous.dailyLimit,authorizationId:input.data.enabled&&!previous.enabled?randomUUID():previous.authorizationId,authorizedAt:input.data.enabled&&!previous.enabled?new Date().toISOString():previous.authorizedAt};await tx.setting.upsert({where:{key:AUTONOMY_KEY},create:{key:AUTONOMY_KEY,value},update:{value}});return value;});
 return NextResponse.json({settings});
}
