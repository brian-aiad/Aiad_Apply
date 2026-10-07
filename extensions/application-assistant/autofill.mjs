// Self-contained so Chrome can serialize this function into the active page.
// This function never clicks buttons, submits a form, or changes an existing answer.
export function inspectAndFill({ contact, resume, fill = false, replaceResume = false, expected = null }) {
  const normalize = value => String(value || '').toLowerCase().replace(/[*✱✳:]/g, '').replace(/\((required|optional)\)/g, '').replace(/\s+/g, ' ').trim();
  const labelFor = element => {
    const labels = Array.from(element.labels || []).map(label => label.textContent?.trim() || '').filter(Boolean);
    const aria = element.getAttribute('aria-label');
    const referenced = (element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || '').filter(Boolean);
    return labels[0] || aria || referenced.join(' ') || element.placeholder || element.name || element.id || 'Unlabelled field';
  };
  const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).opacity !== '0' && !element.closest('[aria-hidden="true"]');
  const fieldNames = {
    'first name': 'firstName', 'given name': 'firstName', 'last name': 'lastName', 'family name': 'lastName',
    'full name': 'fullName', 'name': 'fullName', 'email': 'email', 'email address': 'email', 'confirm email': 'email',
    'phone': 'phone', 'phone number': 'phone', 'mobile phone': 'phone', 'mobile phone number': 'phone',
    'city': 'city', 'state': 'region', 'state / region': 'region', 'zip': 'postalCode', 'zip code': 'postalCode', 'postal code': 'postalCode',
    'linkedin': 'linkedin', 'linkedin profile': 'linkedin', 'linkedin url': 'linkedin', 'linkedin profile url': 'linkedin',
    'portfolio': 'portfolio', 'portfolio url': 'portfolio', 'personal website': 'portfolio', 'website': 'portfolio',
  };
  const autocompleteNames = { 'given-name': 'firstName', 'family-name': 'lastName', name: 'fullName', email: 'email', tel: 'phone', 'address-level2': 'city', 'address-level1': 'region', 'postal-code': 'postalCode' };
  const values = { ...contact, fullName: `${contact.firstName} ${contact.lastName}`.trim() };
  let fields = [], pending = [];
  const skipped = [], uploads = [], recognized = new Map();
  const elements = Array.from(document.querySelectorAll('input, select, textarea'));
  for (const [index, element] of elements.entries()) {
    if (element.disabled || element.readOnly) continue;
    const label = labelFor(element), normalized = normalize(label);
    if (element.type === 'file') {
      if (/\b(resume|résumé|cv|curriculum vitae)\b/i.test(label) && !/cover|photo|additional|supporting/i.test(label)) uploads.push({ element, label, index });
      continue;
    }
    if (!visible(element) || !['text', 'email', 'tel', 'url'].includes(element.type) || element.tagName !== 'INPUT') continue;
    if (element.form?.querySelector('input[type=password]')) { skipped.push({ label, reason: 'Login or account form' }); continue; }
    if (element.getAttribute('role') === 'combobox' || element.hasAttribute('aria-autocomplete')) { skipped.push({ label, reason: 'Custom control; choose manually' }); continue; }
    const auto = (element.autocomplete || '').split(' ').at(-1);
    const key = fieldNames[normalized] || (normalized === normalize(element.name || element.id) ? autocompleteNames[auto] : undefined);
    const legend = element.closest('fieldset')?.querySelector('legend')?.textContent || '';
    if (/reference|emergency|supervisor|manager|referral/i.test(legend)) { skipped.push({ label, reason: 'Someone else’s details; answer manually' }); continue; }
    if (key) recognized.set(key, (recognized.get(key) || 0) + 1);
    if (!key || !values[key]) { if (element.required || element.getAttribute('aria-required') === 'true') skipped.push({ label, reason: 'Answer manually' }); continue; }
    if (element.value.trim()) { skipped.push({ label, reason: 'Existing answer kept' }); continue; }
    if (element.maxLength > 0 && values[key].length > element.maxLength) { skipped.push({ label, reason: 'Value exceeds field length' }); continue; }
    fields.push({ index, label, key, value: values[key] }); pending.push({ element, value: values[key] });
  }
  const ambiguous = fields.map((field, index) => recognized.get(field.key) > 1 ? index : -1).filter(index => index >= 0);
  for (const index of ambiguous) skipped.push({ label: fields[index].label, reason: 'Repeated contact field; confirm manually' });
  fields = fields.filter((_, index) => !ambiguous.includes(index));
  pending = pending.filter((_, index) => !ambiguous.includes(index));
  const upload = uploads.length === 1 ? uploads[0] : null;
  const uploadInfo = upload ? { label: upload.label, index: upload.index, existing: upload.element.files?.[0]?.name || '' } : null;
  const signature = JSON.stringify({ fields, upload: uploadInfo });
  if (fill && expected !== signature) return { error: 'The form changed since preview. Preview again before filling.' };
  let attached = false;
  if (fill) {
    for (const item of pending) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter.call(item.element, item.value);
      item.element.dispatchEvent(new Event('input', { bubbles: true })); item.element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (upload && (!uploadInfo.existing || replaceResume)) {
      const accept = upload.element.accept.toLowerCase();
      if (!accept || accept.split(',').some(type => ['.pdf', 'application/pdf', 'application/*', '*/*'].includes(type.trim()))) {
        const bytes = Uint8Array.from(atob(resume.base64), c => c.charCodeAt(0));
        const transfer = new DataTransfer(); transfer.items.add(new File([bytes], resume.fileName, { type: 'application/pdf' }));
        upload.element.files = transfer.files; upload.element.dispatchEvent(new Event('change', { bubbles: true })); upload.element.dispatchEvent(new Event('input', { bubbles: true })); attached = true;
      }
    }
  }
  return { fields, skipped, upload: uploadInfo, signature, filled: fill ? pending.length : 0, attached,
    uploadMessage: uploads.length > 1 ? 'Multiple resume fields found; attach manually.' : !upload ? 'No unambiguous resume upload found. Attach the PDF manually.' : 'Check the attachment in the employer form after filling.' };
}
