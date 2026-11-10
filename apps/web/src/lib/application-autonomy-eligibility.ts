import {employmentType,payFromText} from './discovery/normalization';
import {localDistance} from './discovery/matching';
export type LiveEligibility={sourceUrl:string;evidenceText:string;worksite:string;observedAt:string};
export function liveEligibilityBlockers(proof:LiveEligibility,prefs:{minimumSalary:number;radiusMiles:number;includeRemote:boolean},now=Date.now()){
 const age=now-Date.parse(proof.observedAt);const pay=payFromText(proof.evidenceText);const distance=localDistance(proof.worksite);
 const months=Number(proof.evidenceText.match(/\b(\d{1,2})\s*months?\s*(?:\/|per)\s*year\b/i)?.[1]||12);
 const min=pay.salaryMin!==null&&/\/month$/.test(pay.salaryText||'')&&months>=1&&months<=12?Math.round(pay.salaryMin*months/12):pay.salaryMin;
 return [
 ...(!Number.isFinite(age)||age<0||age>30*60000?['Live job verification expired.']:[]),
 ...(employmentType(proof.evidenceText)!=='Full-time'?['Full-time employment is not confirmed on the live posting.']:[]),
 ...(min===null||min<prefs.minimumSalary?['Live starting base pay is missing, disputed or below the saved minimum.']:[]),
 ...(distance===null||distance>prefs.radiusMiles||!proof.evidenceText.toLowerCase().includes(proof.worksite.toLowerCase())?['Live worksite is not confirmed within the saved radius.']:[]),
 ...(!prefs.includeRemote&&/\bremote[ -]only\b/i.test(proof.evidenceText)?['Remote-only role is outside saved preferences.']:[]),
 ];
}
