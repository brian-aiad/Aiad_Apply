const keys = ['firstName', 'lastName', 'email', 'phone', 'city', 'region', 'postalCode', 'linkedin', 'portfolio'];
export async function validatePacket(packet, now = Date.now()) {
  if (!packet || packet.format !== 'aiadapply.application.v1' || packet.mode !== 'review_before_submit') throw Error('Choose an AiadApply application packet.');
  if (!packet.applicationId || !packet.runId || !Number.isInteger(packet.runNumber) || packet.runNumber < 1) throw Error('The resume version is missing.');
  if (typeof packet.company !== 'string' || typeof packet.title !== 'string' || packet.company.length > 500 || packet.title.length > 500) throw Error('Job details are invalid.');
  const age = now - Date.parse(packet.preparedAt);
  if (!Number.isFinite(age) || age < -300000 || age > 72 * 60 * 60 * 1000) throw Error('Prepare a fresh packet in AiadApply. Packets expire after 72 hours.');
  const target = new URL(packet.targetUrl);
  if (target.protocol !== 'https:' || target.username || target.password || target.pathname === '/') throw Error('Use a specific employer job link in AiadApply.');
  if (!packet.contact || keys.some(key => typeof packet.contact[key] !== 'string' || packet.contact[key].length > 500)) throw Error('Contact details are invalid.');
  if (['firstName', 'lastName', 'email', 'phone'].some(key => !packet.contact[key])) throw Error('Save your required contact details in AiadApply.');
  const resume = packet.resume;
  if (!resume || resume.mimeType !== 'application/pdf' || !/^[a-f0-9]{64}$/i.test(resume.sha256) || typeof resume.base64 !== 'string' || resume.base64.length > 7_000_000 || !/^[\w .()-]+\.pdf$/i.test(resume.fileName)) throw Error('The resume attachment is invalid.');
  const bytes = Uint8Array.from(atob(resume.base64), c => c.charCodeAt(0));
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw Error('The attachment is not a PDF.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== resume.sha256.toLowerCase()) throw Error('The resume fingerprint does not match. Prepare a new packet.');
  return { ...packet, contact: Object.fromEntries(keys.map(key => [key, packet.contact[key]])) };
}
export function matchesApplicationUrl(targetValue, actualValue) {
  try {
    const target = new URL(targetValue), actual = new URL(actualValue);
    if (target.protocol !== 'https:' || target.origin !== actual.origin || target.pathname === '/') return false;
    const clean = url => decodeURIComponent(url.pathname).replace(/\/(apply|application)\/?$/i, '').replace(/\/$/, '');
    if (clean(target) !== clean(actual)) return false;
    // Preserve job identity query parameters; permit tracking and application step changes only.
    const identity = url => [...url.searchParams].filter(([key]) => !/^(utm_.+|source|ref|referrer|src|step|stage|mode)$/i.test(key)).sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(identity(target)) === JSON.stringify(identity(actual));
  } catch { return false; }
}
