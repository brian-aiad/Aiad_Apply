export const AUTONOMY_KEY = "application:autonomy";
export type AutonomySettings = { enabled: boolean; dailyLimit: number; authorizationId: string | null; authorizedAt: string | null };
export function readAutonomy(value: unknown): AutonomySettings {
 const r=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const authorizationId=typeof r.authorizationId==='string'&&/^[\da-f-]{36}$/i.test(r.authorizationId)?r.authorizationId:null;
 const authorizedAt=typeof r.authorizedAt==='string'&&Number.isFinite(Date.parse(r.authorizedAt))?r.authorizedAt:null;
 return {enabled:r.enabled===true&&!!authorizationId&&!!authorizedAt,dailyLimit:typeof r.dailyLimit==='number'&&Number.isInteger(r.dailyLimit)&&r.dailyLimit>=1&&r.dailyLimit<=10?r.dailyLimit:5,authorizationId,authorizedAt};
}
export function autonomousFitBlockers(input:{excluded:boolean;qualified:boolean;score:number;cautions:string[];riskCount:number;notes:string|null;title:string}) {
 return [
 ...(input.excluded?["Outside saved role, pay, worksite or employment requirements."]:[]),
 ...(!input.qualified||input.score<65?["Material fit needs review."]:[]),
 ...input.cautions.filter(c=>!c.startsWith('Work schedule:')),
 ...(input.riskCount>0?["Resume contains unresolved claim risks."]:[]),
 ...(/QUALIFICATION VERIFICATION HOLD/i.test(input.notes||'')?["A required qualification is awaiting factual confirmation."]:[]),
 ...(/PAY VERIFICATION HOLD/i.test(input.notes||'')?["Published starting pay is disputed."]:[]),
 ...(/\b(?:platform|infrastructure|software|systems?|network) engineer\b/i.test(input.title)&&!/\bsupport\b/i.test(input.title)?["Primary engineering role is outside automatic support applications."]:[]),
 ];
}


export const AUTONOMY_EXECUTION_VERSION = "2026-10-20-custom-controls-v5";
export function unresolvedExportRisks(report: unknown, count: number) {
 if (!report || typeof report !== 'object' || !('claim_risks' in report) || !Array.isArray(report.claim_risks)) return count;
 const risks = report.claim_risks;
 if (!risks.length) return count;
 return risks.filter(r => !r || typeof r !== 'object' || r.export_allowed !== true || r.risk_level === 'high').length;
}
export function recoverableNativePdfFailure(attempt: {status:string;authorizationMode?:string;summary:string;browserStartedAt?:string;submissionStartedAt?:string;executionVersion?:string;technicalRetryCount?:number;runId:string;liveEligibility?:unknown;uploadedResumeVerified?:boolean;questions?:unknown[]}, runId: string) {
 if (attempt.status !== 'BLOCKED' || attempt.authorizationMode !== 'automatic' || attempt.runId !== runId || attempt.submissionStartedAt || attempt.executionVersion === AUTONOMY_EXECUTION_VERSION) return false;
 const retries=attempt.technicalRetryCount||0;
 if(attempt.summary==='The correct job is visible, but “Apply for this Position” has no actionable control reference in the snapshot.')return !!attempt.liveEligibility&&!attempt.uploadedResumeVerified&&!attempt.questions?.length&&retries<3;
 if(attempt.summary==='No supported next action was available.')return !!attempt.liveEligibility&&!attempt.uploadedResumeVerified&&!attempt.questions?.length&&retries<2;
 if(attempt.summary==='Live worksite is not confirmed within the saved radius.')return !attempt.liveEligibility&&!attempt.uploadedResumeVerified&&retries<1;
 if (attempt.summary === 'Could not read the approved resume for application answers.') return !attempt.browserStartedAt && retries<1;
 return attempt.summary === 'The Codex executable was not found. Repair the local worker PATH or Codex executable setting.' && !attempt.liveEligibility && !attempt.uploadedResumeVerified && retries<2;
}

/** Access/eligibility stops before any verified application do not exhaust the
 * daily application budget. They remain parked and cannot loop automatically. */
export function countsTowardAutonomyLimit(a:{authorizationMode?:string;status:string;submissionStartedAt?:string;liveEligibility?:unknown;uploadedResumeVerified?:boolean}) {
 return a.authorizationMode==='automatic' && (!!a.submissionStartedAt||!!a.liveEligibility||a.uploadedResumeVerified===true||['QUEUED','RUNNING','SUBMITTING'].includes(a.status));
}
