import { NextResponse } from "next/server";
import { crossOriginMutation } from "@/lib/web-url";
import { z } from "zod";
import { db } from "@/lib/db";
import { AUTOMATION_POLICY_KEY, record } from "@/lib/workspace-material";
import { lockAutomation, AutomationError } from "@/lib/application-automation-store";
import { selectedAutomationPlatform } from "@/lib/automation-device-policy";
export async function GET() {
 const value = (await db.setting.findUnique({where:{key:AUTOMATION_POLICY_KEY}}))?.value;
 return NextResponse.json({applications:selectedAutomationPlatform(value,"applications"),discovery:selectedAutomationPlatform(value),localPlatform:process.platform});
}
export async function POST(request: Request) {
 if(crossOriginMutation(request))return NextResponse.json({error:"Cross-origin changes are not allowed."},{status:403});
 const input=z.object({platform:z.enum(["win32","darwin"])}).safeParse(await request.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:"Choose Mac or Windows."},{status:400});
 try {
  const value=await db.$transaction(async tx=>{
   await lockAutomation(tx);
   const active=await tx.applicationEvent.count({where:{eventType:"application_automation",toValue:{in:["RUNNING","SUBMITTING"]}}});
   if(active)throw new AutomationError("Wait for the active application to finish or be safely parked before switching computers.");
   const current=record((await tx.setting.findUnique({where:{key:AUTOMATION_POLICY_KEY}}))?.value);
   const value={...current,applicationPlatform:input.data.platform};
   await tx.setting.upsert({where:{key:AUTOMATION_POLICY_KEY},create:{key:AUTOMATION_POLICY_KEY,value},update:{value}});
   return value;
  });
  return NextResponse.json({applications:selectedAutomationPlatform(value,"applications"),discovery:selectedAutomationPlatform(value),localPlatform:process.platform});
 }catch(error){if(error instanceof AutomationError)return NextResponse.json({error:error.message},{status:error.status});throw error;}
}
