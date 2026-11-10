import { createHash } from 'node:crypto';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const origin = url => { try { const u = new URL(url); return u.protocol === 'https:' ? u.origin : null; } catch { return null; } };
const methods = ['fill', 'select', 'choose'];
const safeControl = c => !/password|hidden|file/.test(c.type || '') && !/password|passcode|verification|one.time|otp|consent|agree|certif|waiv|signature|gender|race|ethnic|disabil|veteran|birth|social security/i.test(`${c.label || ''} ${c.context || ''} ${c.autocomplete || ''}`);
const shape = c => [String(c.tag || ''),String(c.type || ''),String(c.role || ''),!!c.required,!!c.disabled];
const committed = c => JSON.stringify([c.value,c.selectedText,c.checked]);
export function methodScope(job, snapshot, frame, control) {
  const topOrigin = origin(snapshot.url), frameOrigin = origin(frame.url);
  if (!topOrigin || !frameOrigin || !safeControl(control)) return null;
  const controls = frame.controls || [];
  const controlHash = digest(shape(control));
  // Without semantic labels, repeated shapes cannot identify one question safely.
  if (controls.filter(c => digest(shape(c)) === controlHash).length !== 1) return null;
  return {version:1,employerHash:digest(String(job.company || '').trim().toLowerCase()),topOrigin,frameOrigin,formHash:digest(controls.map(shape)),controlHash};
}
export function verifiedMethodObservation(job, before, after, ref, method) {
  if (!methods.includes(method) || after.submissionStarted || before.url !== after.url) return null;
  const frame = before.frames.find(f => f.controls.some(c => c.ref === ref));
  const control = frame?.controls.find(c => c.ref === ref);
  if (!control) return null;
  const scope = methodScope(job,before,frame,control);
  if (!scope) return null;
  const nextFrames = after.frames.filter(f => f.url === frame.url);
  if (nextFrames.length !== 1) return null;
  const nextControls = nextFrames[0].controls.filter(c => digest(shape(c)) === scope.controlHash);
  if (nextControls.length !== 1) return null;
  const next = nextControls[0];
  // Scope identity is structural; verification also requires the original question.
  if (next.label !== control.label || next.context !== control.context || committed(next) === committed(control)) return null;
  if (JSON.stringify(methodScope(job,after,nextFrames[0],next)) !== JSON.stringify(scope)) return null;
  return {...scope,method};
}
export function withoutFailedMethods(records, observation) {
  if (!observation.failed) return records;
  const scope = Object.fromEntries(Object.entries(observation).filter(([key]) => key !== 'failed'));
  return records.filter(record => !Object.entries(scope).every(([key,value]) => record[key] === value));
}
export function applicableMethodHints(job, snapshot, records, now = Date.now()) {
  const valid = (Array.isArray(records) ? records.slice(0,200) : []).filter(r => methods.includes(r.method) && !r.failed && Number.isFinite(Date.parse(r.verifiedAt)) && Date.parse(r.verifiedAt) <= now && now-Date.parse(r.verifiedAt) <= 30*86400000);
  if (!valid.length) return [];
  const topOrigin=origin(snapshot.url), employerHash=digest(String(job.company || '').trim().toLowerCase());
  const hints=[];
  for (const frame of snapshot.frames || []) {
    const frameOrigin=origin(frame.url);
    if (!topOrigin || !frameOrigin) continue;
    const controls=frame.controls || [], shapes=controls.map(shape), formHash=digest(shapes);
    const hashes=shapes.map(digest), counts=new Map();
    for (const hash of hashes) counts.set(hash,(counts.get(hash)||0)+1);
    for (const r of valid) {
      if (r.version!==1 || r.topOrigin!==topOrigin || r.frameOrigin!==frameOrigin || r.employerHash!==employerHash || r.formHash!==formHash || counts.get(r.controlHash)!==1) continue;
      const control=controls[hashes.indexOf(r.controlHash)];
      if (safeControl(control)) hints.push({ref:control.ref,method:r.method});
    }
  }
  return hints.slice(0,20);
}

export function failedMethodObservation(job, snapshot, ref, method) {
  if (!methods.includes(method) || snapshot.submissionStarted) return null;
  const frame = snapshot.frames.find(f => f.controls.some(c => c.ref === ref));
  const control = frame?.controls.find(c => c.ref === ref);
  const scope = control && methodScope(job,snapshot,frame,control);
  return scope ? {...scope,method,failed:true} : null;
}
