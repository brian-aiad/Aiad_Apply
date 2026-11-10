/** Original publication dates govern age; observation/repost dates never reset it. */
type Listing = {postedAt: Date|string|null; sourceKey?:string; description?:string};
export function listingAgeDays(postedAt:Listing['postedAt'],now=new Date()) {
 if(!postedAt)return null; const value=new Date(postedAt).getTime();
 return Number.isFinite(value)&&value<=now.getTime()?Math.floor((now.getTime()-value)/86400000):null;
}
export function currentPublicDeadline(p:Listing,now=new Date()) {
 if(!/^(?:calcareers|edjoin|usajobs):/.test(p.sourceKey||''))return false;
 const date=p.description?.match(/^Application closing date: (\d{4}-\d{2}-\d{2}T[^\s]+)/m)?.[1];
 return !!date&&Number.isFinite(Date.parse(date))&&Date.parse(date)>now.getTime();
}
export function listingAgeBlocker(p:Listing,now=new Date()) {
 const age=listingAgeDays(p.postedAt,now);
 if(p.postedAt&&age===null)return 'Original posting date is invalid or in the future.';
 return age!==null&&age>30&&!currentPublicDeadline(p,now)?'Original posting is over 30 days old; excluded from automatic preparation and applications.':null;
}
/** Fresh first, then second week, then fallback; undated is never called new. */
export function listingAgePriority(p:Listing,now=new Date()) {
 const age=listingAgeDays(p.postedAt,now);
 if(age===null)return 3;
 if(age<=7)return 0;if(age<=14)return 1;if(age<=30)return 2;
 return currentPublicDeadline(p,now)?2:4;
}
