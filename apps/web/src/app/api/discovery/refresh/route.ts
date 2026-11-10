import {NextResponse} from 'next/server';
import {requestDesktopRefresh} from '@/lib/discovery/refresh-request';
import {crossOriginMutation} from '@/lib/web-url';
export const runtime='nodejs';
export async function POST(request:Request){
 if(crossOriginMutation(request))return NextResponse.json({error:'Cross-origin changes are not allowed.'},{status:403});
 const input=await request.json().catch(()=>({}));
 // Viewing a dashboard must never start browser/provider collection on that host.
 if(input?.force!==true)return NextResponse.json({reason:'observe_only'});
 try{return NextResponse.json({reason:'requested',request:await requestDesktopRefresh()},{status:202});}
 catch{return NextResponse.json({error:'Could not request a desktop search. Your saved jobs are retained.'},{status:503});}
}
