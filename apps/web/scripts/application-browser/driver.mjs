import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const normalize = text => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const isReceipt = text => !/\b(not|never|no application|unable|failed)\b/i.test(text) && text.split(/[.!?\n]+/).some(sentence => !/\b(if|once|when|will be)\b/i.test(sentence) && /application (?:has been |was )?(?:successfully )?(?:submitted|received)|thank you for (?:applying|your application)|we(?:'ve| have) received your application/i.test(sentence));
const equivalentInput = (control, left, right) => left === right || (control.type === 'tel' && left.replace(/\D/g, '').length >= 7 && left.replace(/\D/g, '') === right.replace(/\D/g, ''));
const finalAction = text => /\b(submit|send application|complete application|finish application|confirm application)\b/i.test(text);

export class ApplicationBrowser {
  constructor(context, job, resumePath, outputDirectory, checkpoint, beforeSubmit) {
    Object.assign(this, { context, job, resumePath, outputDirectory, checkpoint, beforeSubmit });
    this.refs = new Map(); this.sequence = 0; this.identityVerified = false;
    this.uploadVerified = false; this.submissionStarted = false; this.questions = [];
    this.uploadToken = ''; this.uploadReceiptLinks = new Set();
    this.unresolved = []; this.beforeText = ''; this.lastSnapshot = null;
  }
  static async launch({ job, resumePath, outputDirectory, profileDirectory, checkpoint, beforeSubmit, headless = false }) {
    await mkdir(profileDirectory, { recursive: true, mode: 0o700 });
    const context = await chromium.launchPersistentContext(profileDirectory, { channel: 'chrome', headless, viewport: { width: 1280, height: 960 }, acceptDownloads: false });
    const driver = new ApplicationBrowser(context, job, resumePath, outputDirectory, checkpoint, beforeSubmit);
    driver.page = context.pages()[0] || await context.newPage();
    context.on('page', async page => { if (await page.opener() === driver.page) { driver.page = page; driver.identityVerified = false; } });
    try { await driver.page.goto(job.destination, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (error) { await context.close(); throw error; }
    return driver;
  }
  async snapshot() {
    this.refs.clear();
    const frames = [];
    for (const [frameIndex, frame] of this.page.frames().entries()) {
      if (frame.isDetached()) continue;
      const prefix = `s${++this.sequence}f${frameIndex}`;
      const data = await frame.evaluate(({ prefix }) => {
        const visible = el => Boolean(el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
        const label = el => el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.innerText || '').join(' ').trim() || [...(el.labels || [])].map(l => l.innerText).join(' ') || el.closest('[data-field], .field, .form-field, .input-wrapper')?.querySelector('label')?.innerText || el.getAttribute('placeholder') || el.innerText || el.getAttribute('name') || el.id || '';
        const questionContext = el => {
          if (el.getAttribute('role') === 'option') {
            const listId = el.closest('[role="listbox"]')?.id;
            const combo = listId && [...document.querySelectorAll('[role="combobox"]')].find(input => [input.getAttribute('aria-controls'), input.getAttribute('aria-owns')].some(ids => ids?.split(/\s+/).includes(listId)));
            if (combo) return label(combo);
          }
          return el.closest('fieldset')?.querySelector('legend')?.innerText || '';
        };
        const selectedValue = el => el.closest('[class*=control], [data-select]')?.querySelector('[class*=singleValue], [class*=single-value], [data-selected-value]')?.textContent?.trim() || '';
        const controls = [...document.querySelectorAll('input, textarea, select, button, a[href], [role="button"], [role="combobox"], [role="option"], [role="checkbox"], [role="radio"]')]
          .filter(el => visible(el) || el.type === 'file').slice(0, 250).map((el, index) => {
            const ref = `${prefix}-${index}`; el.setAttribute('data-aiad-ref', ref);
            return { ref, tag: el.tagName.toLowerCase(), type: el.type || '', role: el.getAttribute('role') || '',
              label: (el.type === 'file' && !/resume|résumé|\bcv\b|curriculum|cover.?letter/i.test(label(el)) ? [label(el), el.id, el.getAttribute('name')].filter(Boolean).join(' ') : label(el)).trim().slice(0, 1200), context: questionContext(el).slice(0, 1200),
              value: el.type === 'password' ? '[private]' : String(el.value || (el.getAttribute('role') === 'combobox' ? selectedValue(el) : '') || '').slice(0, 12000),
              checked: el.checked ?? (el.hasAttribute('aria-checked') ? el.getAttribute('aria-checked') === 'true' : null), selected: el.hasAttribute('aria-selected') ? el.getAttribute('aria-selected') === 'true' : null, group: el.name || el.getAttribute('aria-controls') || '', required: Boolean(el.required || el.getAttribute('aria-required') === 'true'),
              disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'), href: el.getAttribute('href') || '',
              options: el.tagName === 'SELECT' ? [...el.options].map(o => ({ label: o.text, value: o.value })) : [],
              files: el.type === 'file' ? [...(el.files || [])].map(f => f.name) : [],
            };
          });
        return { text: document.body?.innerText.slice(0, 40000) || '', controls };
      }, { prefix });
      for (const control of data.controls) {
        const target = { frame, control, locator: frame.locator(`[data-aiad-ref="${control.ref}"]`) };
        this.refs.set(control.ref, target);
        const question = [control.context, control.label].filter(Boolean).join(' — ');
        if (['input', 'textarea', 'select'].includes(control.tag) && !['password', 'file', 'hidden', 'submit', 'checkbox', 'radio'].includes(control.type) && control.value && !this.questions.some(q => q.question === question)) {
          const answer = control.tag === 'select' ? control.options.find(o => o.value === control.value)?.label || control.value : control.value;
          if (!/^(select|choose|please select|--)/i.test(answer)) this.recordQuestion(target, answer, 'existing_answer');
        }
      }
      frames.push({ url: frame.url(), ...data });
    }
    const text = frames.map(f => f.text).join('\n');
    this.identityVerified = normalize(text).includes(normalize(this.job.company)) && normalize(text).includes(normalize(this.job.title));
    this.snapshotUrl = this.page.url();
    this.lastSnapshot = { url: this.page.url(), identityVerified: this.identityVerified, resumeUploaded: this.uploadVerified, attachmentPresent: await this.attachmentPresent(), submissionStarted: this.submissionStarted, frames };
    return this.lastSnapshot;
  }
  ref(value) {
    const target = this.refs.get(value);
    if (!target) throw new Error('The page changed. Take a new snapshot before interacting.');
    return target;
  }
  async verifyFile(target) {
    const result = await target.locator.evaluate(async input => {
      if (!input.files || input.files.length !== 1) return null;
      const file = input.files[0];
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      return { name: file.name, hash: Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('') };
    });
    return result?.hash === this.job.resumeSha256 && result.name === path.basename(this.resumePath);
  }
  recordQuestion(target, answer, source) {
    const question = target.control.role === 'option' && target.control.context ? target.control.context : [target.control.context, target.control.label].filter(Boolean).join(' — ');
    if (question.length > 2000 || String(answer).length > 12000) throw new Error('An application answer exceeds the supported report length. Review it manually; no answer was shortened.');
    const entry = { question, answer: String(answer), source };
    const old = this.questions.findIndex(q => q.question === question);
    if (old >= 0) this.questions[old] = entry;
    else {
      if (this.questions.length >= 300) throw new Error('The application exceeds the supported question count. Review it manually.');
      this.questions.push(entry);
    }
  }
  async attachmentPresent() {
    if (!this.uploadVerified) return false;
    let verified = false;
    for (const target of this.refs.values()) {
      if (target.control.type === 'file' && /resume|résumé|\bcv\b|curriculum/i.test(target.control.label)) {
        if (target.control.files.length && !await this.verifyFile(target)) return false;
        if (target.control.files.length) verified = true;
      }
    }
    // A clean filename alone cannot identify a version. Accept only the widget
    // bound to this actual byte-verified upload, or its observed server file URL.
    const name = path.basename(this.resumePath);
    for (const frame of this.page.frames()) {
      const receipt = await frame.evaluate(({ name, token, links }) => {
        const widget = token && document.querySelector(`[data-aiad-upload-token="${token}"]`);
        if (widget?.getAttribute('data-aiad-upload-valid') === 'false') return { invalidated: true, present: false, links: [] };
        const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        if (widget && visible(widget) && widget.textContent.includes(name)) {
          const urls = [...widget.querySelectorAll('a[href]')].filter(el => el.textContent.includes(name) && /^https?:/.test(el.href) && el.href !== location.href).map(el => el.href);
          return { present: true, links: urls };
        }
        return { present: [...document.querySelectorAll('a[href]')].some(el => visible(el) && el.textContent.includes(name) && links.includes(el.href)), links: [] };
      }, { name, token: this.uploadToken, links: [...this.uploadReceiptLinks] });
      if (receipt.invalidated) { this.uploadVerified = false; this.uploadReceiptLinks.clear(); return false; }
      for (const link of receipt.links) this.uploadReceiptLinks.add(link);
      if (receipt.present) return true;
    }
    return verified;
  }
  async act(action) {
    if (this.submissionStarted) throw new Error('Final submission was already attempted. Only inspect the result; never click again.');
    await this.checkpoint({ summary: action.explanation || 'Filling application', questions: this.questions, unresolved: this.unresolved });
    if (action.kind === 'wait') { await new Promise(resolve => setTimeout(resolve, 1000)); return; }
    const target = this.ref(action.ref);
    const { control, locator } = target;
    if (control.disabled) throw new Error('That control is disabled.');
    const answerControl = ['checkbox', 'radio'].includes(control.type) || ['option', 'checkbox', 'radio'].includes(control.role);
    const allowedSource = ['saved_profile', 'approved_resume', 'job_policy', 'existing_answer'].includes(action.source);
    if (action.kind !== 'click' || answerControl) {
      const currentText = (await Promise.all(this.page.frames().filter(frame => !frame.isDetached()).map(frame => frame.locator('body').innerText().catch(() => '')))).join(' ');
      if (!this.identityVerified || this.page.url() !== this.snapshotUrl || !normalize(currentText).includes(normalize(this.job.company)) || !normalize(currentText).includes(normalize(this.job.title))) throw new Error('The page has not shown the approved company and job title. No candidate data will be entered.');
    }
    if (answerControl && (!allowedSource || !action.value)) throw new Error('Every selected answer requires an identified source and value.');
    if (action.kind === 'click' && ['checkbox', 'radio'].includes(control.type)) throw new Error('Use the guarded check action for checkbox and radio answers.');
    if (action.kind === 'click' && ['checkbox', 'radio'].includes(control.role)) throw new Error('Use the guarded check action for checkbox and radio answers.');
    if (action.kind === 'choose') {
      if (control.role !== 'combobox' || !allowedSource || !action.value) throw new Error('Dropdown selection requires a confirmed answer and a combobox.');
      const expected = String(action.value);
      const clean = value => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (control.value) {
        if (clean(control.value) !== clean(expected)) throw new Error(`Existing selection needs review: ${control.label}`);
        return;
      }
      const originalFrame = target.frame;
      const originalLabel = control.label;
      await locator.click({ timeout: 10000 });
      const listIds = await locator.evaluate(el => [el.getAttribute('aria-controls'), el.getAttribute('aria-owns')].filter(Boolean).join(' ').split(/\s+/).filter(Boolean));
      if (!listIds.length) throw new Error('Dropdown has no scoped options; inspect it before choosing.');
      await this.snapshot();
      const candidates = [];
      for (const option of this.refs.values()) {
        if (option.frame !== originalFrame || option.control.role !== 'option' || option.control.disabled || clean(option.control.label) !== clean(expected)) continue;
        const belongs = await option.locator.evaluate((el, ids) => ids.includes(el.closest('[role="listbox"]')?.id), listIds);
        if (belongs) candidates.push(option);
      }
      if (candidates.length !== 1) throw new Error(`No unique exact option for ${originalLabel}; inspect the open dropdown.`);
      await this.act({ ...action, kind: 'click', ref: candidates[0].control.ref });
      await this.snapshot();
      const combos = [...this.refs.values()].filter(t => t.frame === originalFrame && t.control.role === 'combobox' && t.control.label === originalLabel);
      if (combos.length !== 1 || clean(combos[0].control.value) !== clean(expected)) throw new Error(`The selected answer was not retained by ${originalLabel}.`);
      return;
    }
    if (action.kind === 'click') {
      const label = control.label;
      const intermediate = /^(next|continue|save and continue|save & continue)\b/i.test(label);
      if (finalAction(label) || (/^(apply|apply now)$/i.test(label) && this.uploadVerified) || (control.type === 'submit' && !intermediate)) throw new Error('Use the guarded submit action for a final application button.');
      if (control.href && /^(javascript:|data:|file:|mailto:)/i.test(control.href)) throw new Error('Unsupported navigation target.');
      if (control.role === 'option') {
        const selected = await locator.evaluate(el => {
          const list = el.closest('[role="listbox"]');
          const values = [...(list?.querySelectorAll('[role="option"][aria-selected="true"]') || [])].map(el => el.textContent.trim());
          const combo = list?.id && [...document.querySelectorAll('[role="combobox"]')].find(input => input.getAttribute('aria-controls')?.split(/\s+/).includes(list.id));
          // Search text is not a selection; only inspect the selected-value display.
          const display = combo?.closest('[class*=control], [data-select]')?.querySelector('[class*=singleValue], [class*=single-value], [data-selected-value]')?.textContent?.trim();
          if (display) values.push(display);
          return values;
        });
        if (selected.some(value => normalize(value) !== normalize(control.label))) throw new Error(`Existing selection needs review: ${control.label}`);
      }
      await locator.click({ timeout: 10000 });
      if (control.role === 'option') {
        const retained = await target.frame.evaluate(({ ref, value }) => {
          const option = document.querySelector(`[data-aiad-ref="${ref}"]`);
          if (option?.getAttribute('aria-selected') === 'true') return true;
          const normalized = value.toLowerCase().trim();
          return [...document.querySelectorAll('[role="combobox"]')].some(el => [el.value, el.getAttribute('aria-valuetext'), el.textContent, el.closest('[class*=control], [data-select]')?.querySelector('[class*=singleValue], [class*=single-value], [data-selected-value]')?.textContent].some(text => text?.toLowerCase().trim() === normalized));
        }, { ref: control.ref, value: action.value });
        if (!retained) throw new Error('The custom dropdown did not verify the selected answer. Inspect the current selection.');
      }
      if (['option', 'checkbox', 'radio'].includes(control.role) && action.value && ['saved_profile', 'approved_resume', 'job_policy', 'existing_answer'].includes(action.source)) this.recordQuestion(target, action.value, action.source);
      return;
    }
    if (!this.identityVerified) throw new Error('The page has not shown the approved company and job title. No candidate data will be entered.');
    if (action.kind === 'upload') {
      if (control.type !== 'file' || !/resume|résumé|\bcv\b|curriculum/i.test(control.label)) throw new Error('Could not identify an unambiguous resume upload.');
      const bytes = await readFile(this.resumePath);
      if (sha256(bytes) !== this.job.resumeSha256) throw new Error('Approved resume bytes changed. Upload refused.');
      // React ATS forms may remove the input as soon as change fires. Capture
      // the actual browser File before rerender, then hash those retained bytes.
      const proofKey = `__aiadUpload_${randomUUID().replaceAll('-', '')}`;
      await locator.evaluate((input, key) => {
        const container = input.closest('.file-upload, [data-attachment], [data-testid*=resume], .resume-upload, .attachment, .field, .form-field') || input.parentElement;
        const state = { generation: 0, container, promise: null };
        // A later replacement, even with the same filename, revokes this proof.
        document.addEventListener('change', event => {
          const el = event.target;
          if (el?.type === 'file' && (container.contains(el) || /resume|résumé|\bcv\b/i.test([el.id, el.name, el.getAttribute('aria-label')].join(' ')))) {
            state.generation++;
            if (state.generation > 1) container.setAttribute('data-aiad-upload-valid', 'false');
          }
        }, true);
        state.promise = new Promise(resolve => input.addEventListener('change', async () => {
          try {
            if (input.files?.length !== 1) return resolve(null);
            const file = input.files[0];
            const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
            resolve({ name: file.name, hash: Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('') });
          } catch { resolve(null); }
        }, { once: true, capture: true }));
        window[key] = state;
      }, proofKey);
      try {
        await locator.setInputFiles(this.resumePath, { timeout: 15000 });
        const proof = await target.frame.evaluate(async key => {
          let timer;
          try {
            const state = window[key];
            const proof = await Promise.race([state.promise, new Promise(resolve => { timer = setTimeout(() => resolve(null), 10000); })]);
            if (state.generation !== 1) return null;
            state.container.setAttribute('data-aiad-upload-token', key);
            state.container.setAttribute('data-aiad-upload-valid', 'true');
            return proof;
          }
          finally { clearTimeout(timer); delete window[key]; }
        }, proofKey);
        if (proof?.hash !== this.job.resumeSha256 || proof.name !== path.basename(this.resumePath)) throw new Error('Uploaded file did not match the approved resume.');
        this.uploadVerified = true;
        this.uploadToken = proofKey; this.uploadReceiptLinks.clear();
        await this.checkpoint({ summary: 'Uploaded the exact approved resume; browser file bytes verified.', uploadedResumeVerified: true, resumeSha256: this.job.resumeSha256, questions: this.questions, unresolved: this.unresolved });
      } finally { await target.frame.evaluate(key => { delete window[key]; }, proofKey).catch(() => {}); }
      return;
    }
    if (action.kind === 'submit') {
      if (!finalAction(control.label) && !/^(apply|apply now)$/i.test(control.label)) throw new Error('Could not identify an explicit final application submission button.');
      if (this.unresolved.length) throw new Error('Unresolved questions remain before submission.');
      if (!await this.attachmentPresent()) throw new Error('The final page does not verify the correct approved attachment. Submission refused.');
      for (const frame of this.page.frames()) {
        const invalid = await frame.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(el => el.getClientRects().length && !el.disabled && !el.checkValidity()).map(el => el.getAttribute('aria-label') || el.name || el.id));
        const customInvalid = await frame.evaluate(() => [...document.querySelectorAll('[aria-required="true"]')].filter(el => el.getClientRects().length && el.getAttribute('aria-disabled') !== 'true' && !el.disabled && (el.getAttribute('aria-invalid') === 'true' || (el.getAttribute('role') === 'combobox' && !(el.value || el.getAttribute('aria-valuetext') || el.getAttribute('data-value') || el.closest('[class*=control], [data-select]')?.querySelector('[class*=singleValue], [class*=single-value], [data-selected-value]')?.textContent?.trim())) || (['checkbox', 'radio'].includes(el.getAttribute('role')) && el.getAttribute('aria-checked') !== 'true'))).map(el => el.getAttribute('aria-label') || el.id || 'required custom control'));
        invalid.push(...customInvalid);
        if (invalid.length) throw new Error(`Required or invalid fields remain: ${invalid.join(', ')}`);
      }
      this.beforeText = this.lastSnapshot.frames.map(f => f.text).join('\n');
      await this.page.screenshot({ path: path.join(this.outputDirectory, 'before-submit.png'), fullPage: true });
      // Persist a non-retryable boundary BEFORE issuing the final click.
      await this.beforeSubmit({ resumeSha256: this.job.resumeSha256, attachmentVerified: true, questions: this.questions, unresolved: this.unresolved });
      this.submissionStarted = true;
      await locator.click({ timeout: 15000 });
      return;
    }
    if (!['saved_profile', 'approved_resume', 'job_policy', 'existing_answer'].includes(action.source)) throw new Error('Every answer requires an identified source.');
    if (control.type === 'password') throw new Error('Sign-in requires the user in the application browser.');
    const value = String(action.value);
    if (action.kind === 'fill') {
      if (control.value && !equivalentInput(control, control.value, value)) throw new Error(`Existing answer needs review: ${control.label}`);
      await locator.fill(value, { timeout: 10000 });
      if (!equivalentInput(control, await locator.inputValue(), value)) throw new Error('The form did not retain the entered answer.');
    } else if (action.kind === 'select') {
      if (control.value && !/^select|choose|please|--/i.test(control.options.find(o => o.value === control.value)?.label || '') && control.value !== value) throw new Error(`Existing selection needs review: ${control.label}`);
      await locator.selectOption(value, { timeout: 10000 });
      if (await locator.inputValue() !== value) throw new Error('The form did not retain the selected answer.');
    } else if (action.kind === 'check') {
      if (!['true', 'false'].includes(value)) throw new Error('A check answer must be true or false.');
      if (control.checked === true && value === 'false') throw new Error(`Existing selection needs review: ${control.label}`);
      if (control.role === 'radio' && value === 'true') {
        const conflict = await locator.evaluate(el => [...(el.closest('[role="radiogroup"]')?.querySelectorAll('[role="radio"][aria-checked="true"]') || [])].some(other => other !== el));
        if (conflict) throw new Error(`Existing selection needs review: ${control.label}`);
      }
      if (control.type === 'radio' && value === 'true') {
        const conflict = await locator.evaluate(el => [...document.querySelectorAll('input[type=radio]')].some(other => other !== el && other.name === el.name && other.form === el.form && other.checked));
        if (conflict) throw new Error(`Existing selection needs review: ${control.label}`);
      }
      await locator.setChecked(value === 'true', { timeout: 10000 });
      if (await locator.isChecked() !== (value === 'true')) throw new Error('The form did not retain the selected answer.');
    } else throw new Error(`Unsupported browser action: ${action.kind}`);
    this.recordQuestion(target, action.kind === 'select' ? control.options.find(o => o.value === value)?.label || value : value, action.source);
  }
  async receipt(quote) {
    const snapshot = await this.snapshot();
    const text = snapshot.frames.map(f => f.text).join('\n');
    if (!this.submissionStarted || !isReceipt(quote) || !text.includes(quote) || this.beforeText.includes(quote)) return null;
    const screenshot = path.join(this.outputDirectory, 'confirmation.png');
    await this.page.screenshot({ path: screenshot, fullPage: true });
    return { confirmation: quote, confirmationUrl: this.page.url(), screenshot };
  }
  async observeReceipt() {
    if (!this.submissionStarted || this.page.isClosed()) return null;
    const snapshot = await this.snapshot();
    const lines = snapshot.frames.flatMap(frame => frame.text.split(/\n+/)).map(line => line.trim()).filter(line => line.length > 0 && line.length <= 4000);
    for (const line of lines) if (isReceipt(line) && !this.beforeText.includes(line)) {
      const receipt = await this.receipt(line);
      if (receipt) return receipt;
    }
    return null;
  }
}
