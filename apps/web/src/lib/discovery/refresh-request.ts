import {randomUUID} from 'node:crypto';
import {db} from '../db';
export const REFRESH_REQUEST_KEY='discovery:refresh-request';
export type RefreshRequest={id:string;requestedAt:string};
export function refreshRequestFinished(result:{reason?:string;scan?:{status?:string}|null}){
 return result.reason!=='fresh'&&result.reason!=='running'&&['completed','failed'].includes(result.scan?.status||'');
}
export function readRefreshRequest(value:unknown):RefreshRequest|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 return typeof v.id==='string'&&typeof v.requestedAt==='string'&&Number.isFinite(Date.parse(v.requestedAt))?{id:v.id,requestedAt:v.requestedAt}:null;
}
export async function requestDesktopRefresh(){
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(9074031)::text`;
  const pending=readRefreshRequest((await tx.setting.findUnique({where:{key:REFRESH_REQUEST_KEY}}))?.value);
  if(pending)return pending;
  const request={id:randomUUID(),requestedAt:new Date().toISOString()};
  await tx.setting.upsert({where:{key:REFRESH_REQUEST_KEY},create:{key:REFRESH_REQUEST_KEY,value:request},update:{value:request}});
  return request;
 });
}
export async function completeDesktopRefresh(request:RefreshRequest){
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(9074031)::text`;
  const pending=readRefreshRequest((await tx.setting.findUnique({where:{key:REFRESH_REQUEST_KEY}}))?.value);
  if(pending?.id===request.id)await tx.setting.delete({where:{key:REFRESH_REQUEST_KEY}});
 });
}
