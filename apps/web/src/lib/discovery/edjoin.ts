import { detailWindow, isSourceAccessError } from "./detail-window";
import { publicText } from "./local-boards";
import { couldBeRelevant } from "./matching";
import { annualPay, employmentType, textFromHtml, workArrangement } from "./normalization";
import type { Opening, Source } from "./types";
type Row = Record<string, unknown>;
const row=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const str=(v:unknown)=>typeof v==='string'?v:'';
// District IDs are published by EDJOIN's unauthenticated county directory.
export const SCHOOL_DISTRICTS=[517,531,529,521,509];
export function schoolFeed(value:unknown) {
 const j=row(value);if(!Array.isArray(j.data)||typeof j.totalRecords!=='number'||typeof j.totalPages!=='number')throw new Error('School job feed format changed.');
 const rows=j.data.map(row);if(rows.some(v=>!Number.isInteger(v.postingID)||typeof v.positionTitle!=='string'))throw new Error('School posting identity is missing.');
 return {ids:rows.filter(v=>couldBeRelevant(str(v.positionTitle))&&!/current employee|internal|in.?house/i.test(str(v.positionTitle))).map(v=>String(v.postingID)),checked:j.totalRecords,complete:j.totalPages<=1&&rows.length===j.totalRecords};
}
export function schoolOpening(source:Source,html:string,id:string,now=new Date()):Opening|null {
 if(source.key!=='edjoin:orange-schools'||!/^\d+$/.test(id))return null;
 const values=[...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m=>{try{const v=JSON.parse(m[1]);return Array.isArray(v)?v:[v];}catch{return [];}});
 const j=values.map(row).find(v=>v['@type']==='JobPosting');if(!j||String(row(j.identifier).value)!==id)return null;
 const title=str(j.title),description=textFromHtml(j.description),end=new Date(str(j.validThrough));
 if(!couldBeRelevant(title)||/current employee|internal|in.?house/i.test(title)||description.length<300||!Number.isFinite(end.getTime())||end<=now)return null;
 const places=(Array.isArray(j.jobLocation)?j.jobLocation:[j.jobLocation]).map(v=>row(row(v).address));
 const salary=row(j.baseSalary),value=row(salary.value);const org=row(j.hiringOrganization);
 const term=employmentType((Array.isArray(j.employmentType)?j.employmentType:[j.employmentType]).join(' '));
 const annual=annualPay(value.minValue,value.maxValue,salary.currency,value.unitText);
 // A school-year salary paid over 10/11 months must not be annualized as 12.
 const months = Number(str(j.workHours).match(/\b(\d{1,2})\s*months?\s*(?:\/|per)\s*year\b/i)?.[1] || textFromHtml(html).match(/\b(\d{1,2})\s*months?\s*(?:\/|per)\s*year\b/i)?.[1]);
 const pay=/month/i.test(str(value.unitText)) ? months>=1&&months<=12 ? annualPay(Number(value.minValue)*months,Number(value.maxValue)*months,salary.currency,'year') : {salaryMin:null,salaryMax:null,salaryText:'Monthly school-year pay; annual base not confirmed.'} : annual;
 const posted=new Date(str(j.datePosted));
 return {externalId:id,sourceKey:source.key,company:str(org.name)||source.company,title,description:`Application closing date: ${end.toISOString()}\n${description}`,location:places.map(a=>[a.addressLocality,a.addressRegion,a.addressCountry].filter(Boolean).join(', ')).join('; '),sourceUrl:`https://www.edjoin.org/Home/JobPosting/${id}`,employmentType:/temporary|substitute|short[ -]term/i.test(title+' '+description)?'Other':term,workArrangement:workArrangement(description.match(/(?:Work Schedule|Work Arrangement|Location Type):[^\n]+/i)?.[0]||''),...pay,postedAt:Number.isFinite(posted.getTime())?posted:null};
}
export async function collectSchools(source:Source,signal?:AbortSignal,state?:unknown) {
 if(source.key!=='edjoin:orange-schools')throw new Error('Unknown school board.');
 const feeds=await Promise.allSettled(SCHOOL_DISTRICTS.map(async id=>schoolFeed(JSON.parse(await publicText(`https://www.edjoin.org/Home/LoadJobsPortalList?rows=100&page=1&catID=0&districtID=${id}`,signal)))));
 const ids=new Set<string>();let checked=0,failures=0,complete=true;
 for(const f of feeds){if(f.status==='rejected'){if(isSourceAccessError(f.reason))throw f.reason;failures++;complete=false;}else{checked+=f.value.checked;complete&&=f.value.complete;for(const id of f.value.ids)ids.add(id);}}
 const window=detailWindow([...ids],state);
 const openings:Opening[]=[];
 for(const id of window.ids){try{const j=schoolOpening(source,await publicText(`https://www.edjoin.org/Home/JobPosting/${id}`,signal),id);if(j)openings.push(j);}catch(error){if(isSourceAccessError(error))throw error;failures++;}}
 return {openings,liveIds:openings.map(j=>j.externalId),checked,complete:complete&&failures===0&&ids.size<=12,authoritative:false,failures,nextState:window.nextState,continuationPending:window.moreDetails || failures>0};
}
