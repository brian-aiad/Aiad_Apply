/** A verification-only decision deliberately changes no form fields. Observe the
 * page again under the newly verified state instead of treating it as no action. */
export function stepDisposition(decision,verifiedThisStep=false){
 if(decision.outcome==='confirmation'||decision.outcome==='blocked')return decision.outcome;
 if(verifiedThisStep&&Array.isArray(decision.actions)&&decision.actions.length===0)return 'observe';
 if(!Array.isArray(decision.actions)||!decision.actions.length||decision.actions.length>100)throw new Error('No supported next action was available.');
 return 'execute';
}
