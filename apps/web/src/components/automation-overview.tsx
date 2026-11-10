import Link from 'next/link';
import {AUTOMATION_POLICY_KEY} from '@/lib/workspace-material';
import {selectedAutomationPlatform,automationPlatformAllowed} from '@/lib/automation-device-policy';
import {formatInTimeZone} from 'date-fns-tz';
import {db} from '@/lib/db';
import {AUTONOMY_KEY,readAutonomy} from '@/lib/application-autonomy-policy';
import {AUTOMATION_HEARTBEAT,browserWorkerOnline} from '@/lib/application-automation';
import {readAutomationPreferences,type ScanSummary} from '@/lib/discovery/types';
import {nextRegularDiscoveryAt} from '@/lib/discovery/scan-policy';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
async function readOverview(){
 const rows=await db.setting.findMany({where:{key:{in:[AUTOMATION_POLICY_KEY,AUTONOMY_KEY,AUTOMATION_HEARTBEAT,'discovery:automation','discovery:last-scan']}}});
 return {rows,observedAt:new Date().getTime()};
}
export async function AutomationOverview(){
 const {rows,observedAt}=await readOverview();
 const value=(key:string)=>rows.find(r=>r.key===key)?.value;
 const apply=readAutonomy(value(AUTONOMY_KEY)),search=readAutomationPreferences(value('discovery:automation')),scan=object(value('discovery:last-scan'));
 const next=typeof scan.startedAt==='string'&&Array.isArray(scan.sources)?nextRegularDiscoveryAt(scan as unknown as ScanSummary,search.intervalHours):null;
 const sourceNotes=Array.isArray(scan.sources)?scan.sources.map(object).filter(s=>s.status!=='ok'):[];
 const policy=value(AUTOMATION_POLICY_KEY),heartbeat=value(AUTOMATION_HEARTBEAT);
 const device=(purpose:'discovery'|'applications')=>({win32:'Windows',darwin:'Mac',linux:'Linux'}[selectedAutomationPlatform(policy,purpose)||'']||'Selected computer');
 const online=browserWorkerOnline(heartbeat,observedAt)&&automationPlatformAllowed(policy,object(heartbeat).platform,'applications');
 return <section className="automation-overview panel" aria-labelledby="automation-overview-title">
  <header><div><div className="eyebrow">Automation status</div><h2 id="automation-overview-title">Automatic workflow</h2></div><Link href="/settings" className="text-link">Manage automation →</Link></header>
  <div className="automation-lanes">
   <div><span className="lane-label">Find jobs</span><strong>{scan.status==='running'?'Searching now':search.scheduledSearch?`Every ${search.intervalHours} hours · ${device('discovery')}`:'Search paused'}</strong><p>{search.scheduledSearch&&next!==null?next<=observedAt?'Next search is due; the selected computer will check the schedule.':`Next due ${formatInTimeZone(new Date(next!),'America/Los_Angeles','MMM d, h:mm a')} Pacific`:search.scheduledSearch?'First search pending.':'Scheduled collection is not active.'}</p></div>
   <div><span className="lane-label">Tailor resumes</span><strong>{search.autoTailor?'Automatic preparation on':'Automatic preparation paused'}</strong><p>{search.autoTailor?`Up to ${search.dailyLimit} qualifying employer-board resumes per day. LinkedIn has a separate limit.`:'Paste a posting to prepare a resume manually.'}</p></div>
   <div><span className="lane-label">Apply</span><strong>{apply.enabled?'Automatic applications on':'Automatic applications paused'}</strong><p>{apply.enabled?`${online?`${device('applications')} browser online`:`Waiting for ${device('applications')} browser`} · up to ${apply.dailyLimit} attempts per day.`:'Individual application controls remain available.'}</p></div>
  </div>
  {sourceNotes.length?<details className="source-retry-note"><summary>{sourceNotes.length} sources have coverage or access notes</summary><p>Partial coverage is separate from a failed search. Access restrictions stay on hold; other sources continue.</p><ul>{sourceNotes.map((s,i)=><li key={i}><strong>{String(s.company||'Employer source')}</strong> — {s.status==='partial'?(s.continuationPending?'More listings remain for the next collection batch.':'Partial coverage; checked again on the regular schedule.'):String(s.message||'Source check failed; see discovery for details.')}{s.status==='partial'&&typeof s.message==='string'?<span> {s.message}</span>:null}</li>)}</ul></details>:scan.status==='completed'?<p className="overview-footnote">Latest search complete. Jobs must pass eligibility checks; only employer receipts confirm submission.</p>:null}
 </section>;
}
