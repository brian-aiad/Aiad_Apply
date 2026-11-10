import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import path from 'node:path';
import { mkdtemp, mkdir, readdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import { ApplicationBrowser, sha256 } from '../../scripts/application-browser/driver.mjs';
import { captureEmailScreenshot, extractVerificationCode, recognizeScreenshotText } from '../../scripts/application-browser/gmail-verification.mjs';
import { decideApplicationStep, subscriptionEnvironment } from '../../scripts/application-browser/reasoner.mjs';

async function fixture(t) {
  let submissions = 0;
  const bytes = Buffer.from('%PDF-1.4\njob-specific-approved-resume');
  const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
      const parts = [];
      req.on('data', chunk => parts.push(chunk));
      req.on('end', () => {
        assert.ok(Buffer.concat(parts).includes(bytes)); submissions++;
        res.writeHead(303, { Location: '/received' }); res.end();
      });
    } else if (req.url === '/received') res.end('<h1>Fixture Company</h1><p>Thank you for applying. Your application was received.</p><p>Support Engineer · Receipt TEST-123</p>');
    else res.end(`<h1>Fixture Company</h1><h2>Support Engineer</h2><form method="post" enctype="multipart/form-data"><label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Resume<input name="resume" type="file" required></label><button type="submit">Submit application</button></form>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aiadapply-browser-test-'));
  const output = path.resolve('../../output/playwright/application-automation', path.basename(directory));
  await mkdir(output, { recursive: true });
  const job = { company: 'Fixture Company', title: 'Support Engineer', destination: `http://127.0.0.1:${server.address().port}`, resumeSha256: sha256(bytes) };
  const resumePath = path.join(directory, 'Brian_Aiad_Resume_Fixture_Support_Engineer.pdf');
  await writeFile(resumePath, bytes);
  let boundary = 0;
  const driver = await ApplicationBrowser.launch({ job, resumePath, outputDirectory: output, profileDirectory: path.join(directory, 'profile'), headless: true, checkpoint: async () => {}, beforeSubmit: async () => { boundary++; } });
  t.after(async () => { await driver.context.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const ref = label => [...driver.refs.values()].find(t => t.control.label === label)?.control.ref;
  return { driver, job, ref, directory, output, resumePath, submissions: () => submissions, boundary: () => boundary };
}
test('real browser refuses wrong bytes, missing fields and unguarded submit; confirms the exact uploaded resume once', async t => {
  const f = await fixture(t);
  const action = (kind, label, value = '') => ({ kind, ref: f.ref(label), value, source: 'saved_profile', explanation: 'Isolated fixture' });
  await f.driver.snapshot();
  await assert.rejects(f.driver.act(action('submit', 'Submit application')), /attachment/);
  await assert.rejects(f.driver.act(action('click', 'Submit application')), /guarded submit/);
  const approved = Buffer.from('%PDF-1.4\njob-specific-approved-resume');
  await writeFile(f.resumePath, 'wrong-resume');
  await assert.rejects(f.driver.act(action('upload', 'Resume')), /fingerprint|bytes changed/);
  await writeFile(f.resumePath, approved);
  await f.driver.act(action('upload', 'Resume'));
  await f.driver.snapshot();
  await assert.rejects(f.driver.act(action('submit', 'Submit application')), /Required or invalid/);
  await f.driver.act(action('fill', 'Full name', 'Test Person'));
  await f.driver.act(action('fill', 'Email', 'test@example.com'));
  await f.driver.snapshot();
  await f.driver.act(action('submit', 'Submit application'));
  await f.driver.page.waitForURL('**/received');
  assert.equal(f.submissions(), 1); assert.equal(f.boundary(), 1);
  assert.equal(await f.driver.receipt('Your resume was uploaded.'), null);
  assert.ok(await f.driver.receipt('Thank you for applying. Your application was received.'));
  await assert.rejects(f.driver.act(action('submit', 'Submit application')), /already attempted/);
  assert.equal(f.submissions(), 1);
});
test('snapshot omits hidden iframe errors but retains visible CAPTCHA challenges and form frames', async t => {
  const f = await fixture(t);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2>
    <iframe style="display:none" srcdoc="<p>Hidden CAPTCHA: Please try again.</p>"></iframe>
    <iframe srcdoc="<p>Visible CAPTCHA challenge</p><button>Verify</button>"></iframe>
    <iframe srcdoc="<label>Email<input name=email></label>"></iframe>`);
  await f.driver.page.frames()[1].waitForLoadState();
  await f.driver.page.frames()[2].waitForLoadState();
  await f.driver.page.frames()[3].waitForLoadState();
  let snapshot = await f.driver.snapshot();
  assert.equal(snapshot.frames.some(frame => frame.text.includes('Hidden CAPTCHA')), false);
  assert.ok(snapshot.frames.some(frame => frame.text.includes('Visible CAPTCHA challenge')));
  assert.ok(snapshot.frames.some(frame => frame.controls.some(control => control.name === 'email')));
  await f.driver.page.locator('iframe').nth(0).evaluate(el => { el.style.display = 'block'; });
  snapshot = await f.driver.snapshot();
  assert.ok(snapshot.frames.some(frame => frame.text.includes('Hidden CAPTCHA')));
});
test('candidate data is not entered on the wrong job and conflicting answers are preserved', async t => {
  const f = await fixture(t);
  f.driver.job.title = 'Different Job'; await f.driver.snapshot();
  const fill = { kind: 'fill', ref: f.ref('Full name'), value: 'New name', source: 'saved_profile' };
  await assert.rejects(f.driver.act(fill), /approved company and job title/);
  f.driver.job.title = 'Support Engineer'; await f.driver.snapshot();
  await f.driver.page.locator('input[name=name]').fill('Existing Person');
  await f.driver.snapshot();
  await assert.rejects(f.driver.act({ ...fill, ref: f.ref('Full name') }), /Existing answer/);
  assert.equal(await f.driver.page.locator('input[name=name]').inputValue(), 'Existing Person');
});
test('application model cannot use a paid API fallback or worker/database secrets', () => {
  const env = subscriptionEnvironment({ OPENAI_API_KEY: 'private', ANTHROPIC_API_KEY: 'private', WORKER_SECRET: 'private', DATABASE_URL: 'private', PATH: '/bin' });
  assert.deepEqual(env, { PATH: '/bin', CODEX_SKIP_GIT_SYNC: '1' });
});
test('live subscription model completes the isolated mock form with the actual guarded browser', { skip: process.env.AIADAPPLY_TEST_LIVE_REASONER !== '1', timeout: 900000 }, async t => {
  const f = await fixture(t);
  let error = '';
  for (let step = 1; step <= 8; step++) {
    const snapshot = await f.driver.snapshot();
    const decision = await decideApplicationStep({ job: f.job, profile: { firstName: 'Test', lastName: 'Person', email: 'test@example.com' }, setup: {}, approvedResumeText: 'Test Person. Support Engineer. Email: test@example.com.', snapshot, previousError: error, answeredQuestions: f.driver.questions }, f.output, step);
    if (decision.outcome === 'confirmation') { assert.ok(await f.driver.receipt(decision.confirmationText)); assert.equal(f.submissions(), 1); return; }
    assert.notEqual(decision.outcome, 'blocked', JSON.stringify(decision));
    error = '';
    if (f.driver.submissionStarted) continue;
    for (const action of decision.actions) {
      try { await f.driver.act(action); } catch (e) { error = e.message; break; }
      if (['click', 'upload', 'submit'].includes(action.kind)) break;
    }
  }
  assert.fail(`Model did not finish mock form: ${error}`);
});

test('ATS controls resolve accessible names, preserve answers and guard custom required fields', async t => {
  const f = await fixture(t);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2>
    <span id="country-label">Country</span><input role="combobox" aria-labelledby="country-label" aria-controls="countries" aria-required="true" id="country">
    <div role="listbox" id="countries"><div role="option" aria-selected="false" onclick="document.getElementById('country').value='United States';this.setAttribute('aria-selected','true')">United States</div></div>
    <label>Existing consent<input type="checkbox" checked></label>
    <label>Yes<input name="eligibility" type="radio" checked></label><label>No<input name="eligibility" type="radio"></label>
    <div class="field"><label>Resume attachment</label><input type="file" hidden></div><button>Submit application</button>`);
  await f.driver.snapshot();
  const action = (kind, label, value = '', source = 'saved_profile') => ({ kind, ref: f.ref(label), value, source });
  assert.ok(f.ref('Country'));
  await assert.rejects(f.driver.act(action('click', 'Existing consent', 'false')), /guarded check/);
  await assert.rejects(f.driver.act(action('check', 'Existing consent', 'false')), /Existing selection/);
  await assert.rejects(f.driver.act(action('check', 'No', 'true')), /Existing selection/);
  await assert.rejects(f.driver.act(action('click', 'United States', 'United States', 'unanswered')), /identified source/);
  await f.driver.act(action('upload', 'Resume attachment'));
  await f.driver.snapshot();
  await assert.rejects(f.driver.act(action('submit', 'Submit application')), /invalid fields/);
  await f.driver.act(action('click', 'United States', 'United States'));
  assert.deepEqual(f.driver.questions.find(question => question.question === 'Country'), { question: 'Country', answer: 'United States', source: 'saved_profile' });
  await f.driver.snapshot();
  assert.equal(await f.driver.page.locator('#country').inputValue(), 'United States');
  await f.driver.page.locator('#country').evaluate(el => { const wrapper = document.createElement('div'); wrapper.className = 'select__control'; el.replaceWith(wrapper); wrapper.append(el); el.value = ''; const selected = document.createElement('span'); selected.className = 'select__single-value'; selected.textContent = 'United States'; wrapper.append(selected); });
  await f.driver.snapshot();
  assert.equal(f.driver.ref(f.ref('Country')).control.value, 'United States', 'React select retains selected text even when search input clears');
  await f.driver.page.locator('#countries').evaluate(el => { el.innerHTML = '<div role="option" aria-selected="false">Canada</div>'; });
  await f.driver.snapshot();
  await assert.rejects(f.driver.act(action('click', 'Canada', 'Canada')), /Existing selection/);
  f.driver.unresolved = ['Required unknown screening fact'];
  await assert.rejects(f.driver.act(action('submit', 'Submit application')), /Unresolved questions/);
  assert.equal(f.boundary(), 0);
});

test('multistep attachment requires a scoped receipt; wrong job navigation revokes identity', async t => {
  const f = await fixture(t);
  await f.driver.snapshot();
  await f.driver.act({ kind: 'upload', ref: f.ref('Resume') });
  const name = path.basename(f.resumePath);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><p>${name}</p><button>Submit application</button>`);
  await f.driver.snapshot();
  assert.equal(await f.driver.attachmentPresent(), false, 'unrelated filename text is not attachment evidence');
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><div class="attachment">Resume uploaded: ${name}</div><button>Submit application</button>`);
  await f.driver.snapshot();
  assert.equal(await f.driver.attachmentPresent(), false, 'the same clean filename is not proof of this upload');
  await f.driver.page.setContent('<h1>Other Company</h1><h2>Different Job</h2><label>Full name<input></label><button>Submit application</button>');
  await f.driver.snapshot();
  assert.equal(f.driver.identityVerified, false);
  await assert.rejects(f.driver.act({ kind: 'fill', ref: f.ref('Full name'), source: 'saved_profile', value: 'Test Person' }), /approved company/);
  assert.equal(f.boundary(), 0);
});

test('receipt recognition rejects failure, negation and future promises', async () => {
  const { isReceipt } = await import('../../scripts/application-browser/driver.mjs');
  for (const text of ['No application received', 'Your application was not submitted', 'Once your application is submitted we will notify you', 'If application received then email follows', 'Application submitted failed']) assert.equal(isReceipt(text), false, text);
  assert.equal(isReceipt('Your application was successfully submitted.'), true);
  assert.equal(isReceipt('Thanks for applying! Your application has been successfully submitted and you will be notified if you are a good fit for this position.'), true);
  assert.equal(isReceipt('If you complete the form, thanks for applying.'), false);
  assert.equal(isReceipt('Thank you! We appreciate your interest in joining our team and we look forward to reviewing your application.'), true);
  assert.equal(isReceipt('Once you submit, we look forward to reviewing your application.'), false);
  assert.equal(isReceipt('We look forward to receiving your application.'), false);
  assert.equal(isReceipt('Your application has been received. If there is a fit, someone will be getting back to you.'), true);
  assert.equal(isReceipt('Your application will be received if you complete verification.'), false);
  assert.equal(isReceipt('Your application has been received if verification passes.'), false);
});

test('Greenhouse Attach labels distinguish resume bytes from the cover-letter control', async t => {
  const f = await fixture(t);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2>
    <div><button>Attach</button><label for="resume">Attach</label><input id="resume" type="file" hidden></div>
    <div><button>Attach</button><label for="cover_letter">Attach</label><input id="cover_letter" type="file" hidden></div>`);
  const snapshot = await f.driver.snapshot();
  const controls = snapshot.frames.flatMap(frame => frame.controls);
  const resume = controls.find(control => control.type === 'file' && control.label.includes('resume'));
  const cover = controls.find(control => control.type === 'file' && control.label.includes('cover_letter'));
  const action = ref => ({ kind: 'upload', ref, value: '', source: 'approved_resume', explanation: 'Exact approved resume' });
  await assert.rejects(f.driver.act(action(cover.ref)), /unambiguous resume/);
  await f.driver.act(action(resume.ref));
  assert.equal(f.driver.uploadVerified, true);
  assert.equal(await f.driver.verifyFile(f.driver.ref(resume.ref)), true);
  assert.deepEqual(await f.driver.page.locator('#cover_letter').evaluate(el => [...el.files].map(file => file.name)), []);
});

test('telephone formatting preserves the same digits without permitting different numbers', async t => {
  const f = await fixture(t);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><label>Phone<input type="tel" oninput="this.value=this.value.replace(/[^0-9]/g,'')"></label>`);
  await f.driver.snapshot();
  const action = value => ({ kind: 'fill', ref: f.ref('Phone'), value, source: 'saved_profile' });
  await f.driver.act(action('+1 (555) 123-4567'));
  await f.driver.snapshot();
  await f.driver.act(action('+1 (555) 123-4567'));
  await assert.rejects(f.driver.act(action('+1 (555) 999-9999')), /Existing answer/);
});

test('resume proof survives an ATS replacing the file input immediately on upload', async t => {
  const f = await fixture(t);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2>
    <div data-attachment><label for="resume">Attach</label><input id="resume" type="file"></div>`);
  await f.driver.page.locator('#resume').evaluate(input => input.addEventListener('change', () => {
    const receipt = document.createElement('span'); receipt.textContent = 'Resume uploaded: ' + input.files[0].name;
    input.parentElement.replaceChildren(receipt);
  }));
  const snapshot = await f.driver.snapshot();
  const file = snapshot.frames[0].controls.find(control => control.type === 'file');
  await f.driver.act({ kind: 'upload', ref: file.ref, value: '', source: 'approved_resume' });
  assert.equal(f.driver.uploadVerified, true);
  await f.driver.snapshot();
  assert.equal(await f.driver.attachmentPresent(), true);
});

test('clean filename retains exact bytes and follows only the observed server attachment', async t => {
  const f = await fixture(t);
  assert.equal(path.basename(f.resumePath), 'Brian_Aiad_Resume_Fixture_Support_Engineer.pdf');
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><div data-attachment><label for="resume">Resume</label><input id="resume" type="file"></div>`);
  await f.driver.page.locator('#resume').evaluate(input => input.addEventListener('change', () => {
    const receipt = document.createElement('a'); receipt.href='/attachments/new-upload-id';receipt.textContent=input.files[0].name;
    input.parentElement.replaceChildren(receipt);
  }));
  await f.driver.snapshot();
  await f.driver.act({ kind: 'upload', ref: f.ref('Resume'), source: 'approved_resume' });
  await f.driver.snapshot();
  assert.equal(await f.driver.attachmentPresent(), true);
  const name = path.basename(f.resumePath);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><a href="/attachments/old-upload-id">${name}</a>`);
  await f.driver.snapshot();assert.equal(await f.driver.attachmentPresent(), false);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><a href="/attachments/new-upload-id">${name}</a>`);
  await f.driver.snapshot();assert.equal(await f.driver.attachmentPresent(), true);
});
test('replacing an upload with different bytes under the same clean filename invalidates it', async t => {
  const f = await fixture(t);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><div data-attachment><label for="resume">Resume</label><input id="resume" type="file"></div>`);
  await f.driver.snapshot();await f.driver.act({ kind: 'upload', ref: f.ref('Resume'), source: 'approved_resume' });
  await f.driver.page.locator('#resume').setInputFiles({ name: path.basename(f.resumePath), mimeType: 'application/pdf', buffer: Buffer.from('wrong version') });
  await f.driver.snapshot();assert.equal(await f.driver.attachmentPresent(), false);
});

test('native resume autofill imports the approved file and preserves parsed answers before submission', async t => {
  const f = await fixture(t);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2>
    <button type="button" onclick="document.querySelector('form').hidden=false;this.remove()">Autofill with resume</button>
    <form hidden method="post" enctype="multipart/form-data">
    <label>Full name<input id="name" name="name" required></label><label>Email<input id="email" name="email" type="email" required></label>
    <label>Resume<input name="resume" type="file" required></label><button type="submit">Submit application</button></form>`);
  await f.driver.page.locator('input[type=file]').evaluate(input => input.addEventListener('change', () => {
    document.getElementById('name').value='Test Person';document.getElementById('email').value='test@example.com';
  }));
  await f.driver.snapshot();
  await f.driver.act({ kind: 'click', ref: f.ref('Autofill with resume'), source: 'job_policy', value: '' });
  await f.driver.snapshot();
  await f.driver.act({ kind: 'upload', ref: f.ref('Resume'), source: 'approved_resume' });
  await f.driver.snapshot();
  assert.equal(f.driver.questions.find(q => q.question === 'Full name').answer, 'Test Person');
  await assert.rejects(f.driver.act({ kind: 'fill', ref: f.ref('Full name'), source: 'saved_profile', value: 'Different Person' }), /Existing answer/);
  await f.driver.act({ kind: 'submit', ref: f.ref('Submit application'), source: 'job_policy' });
  await f.driver.page.waitForURL('**/received');
  assert.ok(await f.driver.receipt('Your application was received.'));
  assert.equal(f.submissions(), 1);
});

test('a late verification receipt is observed without repeating any submission action', async t => {
  const f = await fixture(t);
  f.driver.submissionStarted = true;
  f.driver.beforeText = 'Support Engineer application';
  await f.driver.page.setContent('<h1>Fixture Company</h1><p>Check your email for a verification code.</p>');
  assert.equal(await f.driver.observeReceipt(), null);
  await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><p>Your application was received.</p>');
  assert.ok(await f.driver.observeReceipt());
  assert.equal(f.submissions(), 0, 'observation issues no POST and never clicks submit');
});

test('live subscription model uses native resume autofill and verifies the resulting submission', { skip: process.env.AIADAPPLY_TEST_LIVE_REASONER !== '1' }, async t => {
  const f = await fixture(t);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2>
    <button type="button" onclick="document.querySelector('form').hidden=false;this.remove()">Autofill with resume</button>
    <form hidden method="post" enctype="multipart/form-data">
    <label>Full name<input id="name" name="name" required></label><label>Email<input id="email" name="email" type="email" required></label>
    <label>Resume<input name="resume" type="file" required></label><button type="submit">Submit application</button></form>`);
  await f.driver.page.locator('input[type=file]').evaluate(input => input.addEventListener('change', () => {
    document.getElementById('name').value='Test Person'; document.getElementById('email').value='test@example.com';
  }));
  let previousError = '', usedNativeFlow = false;
  for (let step = 1; step <= 10; step++) {
    const snapshot = await f.driver.snapshot();
    const decision = await decideApplicationStep({ job: f.job, profile: { firstName: 'Test', lastName: 'Person', email: 'test@example.com' }, setup: {}, applicationHistory: [], approvedResumeText: 'Test Person. Support Engineer. test@example.com.', snapshot, previousError, answeredQuestions: f.driver.questions }, f.output, step);
    f.driver.unresolved = decision.unresolved;
    if (decision.outcome === 'confirmation') {
      assert.ok(await f.driver.receipt(decision.confirmationText));
      assert.equal(usedNativeFlow, true);
      assert.equal(f.submissions(), 1);
      return;
    }
    assert.notEqual(decision.outcome, 'blocked', decision.summary);
    if (f.driver.submissionStarted) { await new Promise(resolve => setTimeout(resolve, 250)); continue; }
    previousError = '';
    for (const action of decision.actions) {
      if (action.kind === 'click' && f.driver.ref(action.ref).control.label === 'Autofill with resume') usedNativeFlow = true;
      try { await f.driver.act(action); } catch (error) { previousError = error.message; break; }
      if (['click', 'upload', 'submit'].includes(action.kind)) break;
    }
  }
  assert.fail(`Native autofill model did not finish: ${previousError}`);
});

test('batched dropdown plan scopes identical options and verifies each committed answer without model calls', async t => {
  const { executeFormPlan, routineContactActions } = await import('../../scripts/application-browser/form-plan.mjs');
  const f = await fixture(t);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2>
    <label>Email<input type="email" name="email"></label>
    ${['Authorization','Sponsorship'].map((label,i) => `<div data-select><label for="c${i}">${label}</label><input id="c${i}" role="combobox" aria-controls="l${i}" readonly onclick="document.getElementById('l${i}').hidden=false"><span data-selected-value></span><div id="l${i}" role="listbox" hidden>${['Yes','No'].map(value => `<div role="option" onclick="this.closest('[data-select]').querySelector('[data-selected-value]').textContent='${value}';this.parentElement.hidden=true">${value}</div>`).join('')}</div></div>`).join('')}`);
  const contact = routineContactActions(await f.driver.snapshot(), { email:'test@example.com' });
  assert.equal(contact.length,1);
  await executeFormPlan(f.driver,contact);
  await f.driver.snapshot();
  const actions = ['Authorization','Sponsorship'].map((label,i) => ({kind:'choose',ref:f.ref(label),value:i ? 'No':'Yes',source:'saved_profile',explanation:'Confirmed fixture fact'}));
  await executeFormPlan(f.driver,actions);
  assert.deepEqual(await f.driver.page.locator('[data-selected-value]').allTextContents(),['Yes','No']);
  assert.equal(f.boundary(),0);
  await f.driver.snapshot();
  await assert.rejects(f.driver.act({...actions[0],ref:f.ref('Authorization'),value:'No'}),/Existing selection/);
  assert.equal(routineContactActions(await f.driver.snapshot(),{email:'another@example.com'}).length,0);
});

test('dropdown plan refuses changed questions and absent exact options', async t => {
  const { executeFormPlan } = await import('../../scripts/application-browser/form-plan.mjs');
  const f = await fixture(t);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><div data-select><label for="c">Choice</label><input id="c" role="combobox" aria-controls="options" readonly onclick="document.getElementById('options').hidden=false"><span data-selected-value></span><div id="options" role="listbox" hidden><div role="option" onclick="document.querySelector('[data-selected-value]').textContent='Yes';this.parentElement.hidden=true;document.querySelector('label[for=detail]').textContent='Different question'">Yes</div></div></div><label for="detail">Detail</label><input id="detail">`);
  await f.driver.snapshot();
  const choose = {kind:'choose',ref:f.ref('Choice'),value:'No',source:'saved_profile'};
  await assert.rejects(f.driver.act(choose),/unique exact option/);
  await f.driver.snapshot();
  await assert.rejects(executeFormPlan(f.driver,[{...choose,ref:f.ref('Choice'),value:'Yes'},{kind:'fill',ref:f.ref('Detail'),value:'Do not fill',source:'saved_profile'}]),/question changed/);
  assert.equal(await f.driver.page.locator('#detail').inputValue(),'');
  assert.equal(f.boundary(),0);
});

test('live model batches familiar dropdowns and completes guarded application in at most four decisions', {skip:process.env.AIADAPPLY_TEST_LIVE_REASONER !== '1',timeout:900000}, async t => {
  const {executeFormPlan} = await import('../../scripts/application-browser/form-plan.mjs');
  const f = await fixture(t);
  await f.driver.page.locator('form').evaluate(form => {
    for (const [index,label] of ['Authorized to work in the United States?','Require sponsorship?'].entries()) {
      const block=document.createElement('div');block.setAttribute('data-select','');
      block.innerHTML=`<label for="choice${index}">${label}</label><input id="choice${index}" role="combobox" aria-controls="options${index}" readonly><span data-selected-value></span><div id="options${index}" role="listbox" hidden></div>`;
      const input=block.querySelector('input'),list=block.querySelector('[role=listbox]');
      input.onclick=()=>{list.hidden=false;};
      for(const value of ['Yes','No']) {const option=document.createElement('div');option.setAttribute('role','option');option.textContent=value;option.onclick=()=>{block.querySelector('[data-selected-value]').textContent=value;list.hidden=true;};list.append(option);}
      form.prepend(block);
    }
  });
  let modelCalls=0, choices=0, previousError='';
  for(let step=1;step<=5;step++) {
    if(f.driver.submissionStarted) {await f.driver.page.waitForURL('**/received');assert.ok(await f.driver.observeReceipt());break;}
    const snapshot=await f.driver.snapshot();
    const decision=await decideApplicationStep({job:f.job,profile:{firstName:'Test',lastName:'Person',email:'test@example.com',workAuthorization:'Yes',sponsorship:'No'},setup:{},applicationAnswers:[{question:'Authorized to work in the United States?',answer:'Yes'},{question:'Require sponsorship?',answer:'No'}],approvedResumeText:'Test Person. Support Engineer. Email test@example.com.',snapshot,previousError,answeredQuestions:f.driver.questions},f.output,step);
    modelCalls++;assert.equal(decision.outcome,'continue',JSON.stringify(decision));f.driver.unresolved=decision.unresolved;
    choices+=decision.actions.filter(a=>a.kind==='choose').length;
    try {await executeFormPlan(f.driver,decision.actions);previousError='';}catch(error){previousError=error.message;}
  }
  assert.equal(f.submissions(),1);assert.equal(f.boundary(),1);assert.ok(choices>=2);assert.ok(modelCalls<=4,`Used ${modelCalls} calls`);
});

test('choose preserves an open toggling dropdown and searches unloaded options', async t => {
  const f = await fixture(t);
  await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><div data-select><label for="degree">Degree</label><input id="degree" role="combobox" aria-controls="degrees" readonly onclick="document.getElementById('degrees').hidden=!document.getElementById('degrees').hidden"><span data-selected-value></span><div id="degrees" role="listbox" hidden><div role="option" onclick="document.querySelector('[data-selected-value]').textContent=this.textContent;this.parentElement.hidden=true">Bachelor's Degree</div></div></div><div data-select><label for="school">School</label><input id="school" role="combobox" aria-controls="schools" onclick="document.getElementById('schools').hidden=false"><span data-selected-value></span><div id="schools" role="listbox" hidden></div></div>`);
  await f.driver.page.locator('#school').evaluate(input => {input.oninput=()=>{const list=document.getElementById('schools');list.innerHTML='';if(input.value==='Example University'){const option=document.createElement('div');option.setAttribute('role','option');option.textContent='Example University';option.onclick=()=>{input.closest('[data-select]').querySelector('[data-selected-value]').textContent=option.textContent;input.value='';list.hidden=true;};list.append(option);}};});
  await f.driver.snapshot();await f.driver.act({kind:'click',ref:f.ref('Degree'),value:'',source:'saved_profile'});
  await f.driver.snapshot();await f.driver.act({kind:'choose',ref:f.ref('Degree'),value:"Bachelor's Degree",source:'approved_resume'});
  assert.equal(await f.driver.page.locator('[data-selected-value]').first().textContent(),"Bachelor's Degree");
  await f.driver.snapshot();await f.driver.act({kind:'choose',ref:f.ref('School'),value:'Example University',source:'approved_resume'});
  assert.equal(await f.driver.page.locator('[data-selected-value]').last().textContent(),'Example University');
  assert.equal(f.driver.questions.find(q=>q.question==='School')?.answer,'Example University');
});

test('verification rejection is observed without another submit and a later receipt remains observable', async t => {
  const f = await fixture(t);
  const { verificationState } = await import('../../scripts/application-browser/verification.mjs');
  f.driver.submissionStarted = true;
  await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><p>Enter the security code to confirm you are a human.</p><label>Security code<input autocomplete="one-time-code"></label><p role="alert">Invalid security code</p><button>Submit application</button>');
  assert.equal(await f.driver.observeReceipt(), null);
  assert.equal(verificationState(f.driver.lastSnapshot), 'rejected');
  assert.equal(f.submissions(), 0);
  await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><p>Thank you for applying. Your application was received.</p>');
  assert.ok(await f.driver.observeReceipt());
  assert.equal(f.submissions(), 0);
});

test('email verification uses the newest code once in the same tab and never records it as an answer', async t => {
  const f = await fixture(t);
  const page = f.driver.page;
  f.driver.submissionStarted = true;
  f.driver.beforeText = 'Support Engineer application';
  await page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2>
    <form onsubmit="event.preventDefault();document.body.innerHTML='<h1>Fixture Company</h1><h2>Support Engineer</h2><p>Thank you for applying. Your application was received.</p>'">
      <label>Verification code<input name="verification_code" autocomplete="one-time-code" required></label>
      <button type="submit">Verify code</button>
    </form>`);
  assert.equal(f.driver.verificationRecipient('test@example.com'), 'test@example.com');
  await f.driver.completeVerification('aB12Cd');
  assert.equal(f.driver.page, page);
  assert.ok(await f.driver.observeReceipt());
  assert.equal(f.driver.questions.some(question => question.answer === 'aB12Cd'), false);
  assert.equal(f.driver.verificationCodeMayRemain, false);
  assert.equal(f.submissions(), 0, 'email verification must not reissue the application submit');
});

test('screenshot fallback reads an image-only code locally without persisting the screenshot', async t => {
  const f = await fixture(t);
  const filesBefore = await readdir(f.output);
  const codePage = await f.driver.context.newPage();
  await codePage.setContent('<main style="font: bold 72px Arial; padding: 40px">aB12Cd</main>');
  const image = await codePage.screenshot({ type: 'png' });
  await codePage.close();
  const screenshot = await captureEmailScreenshot({
    message: { payload: { headers: [
      { name: 'From', value: 'no-reply@example.com' },
      { name: 'To', value: 'test@example.com' },
      { name: 'Subject', value: 'Your verification code' },
    ] } },
    body: 'Your Fixture Company verification code is:',
    images: [{ mimeType: 'image/png', data: image }],
  }, f.driver.context);
  const text = await recognizeScreenshotText(screenshot);
  assert.equal(extractVerificationCode(text), 'aB12Cd', `OCR output: ${JSON.stringify(text)}`);
  assert.deepEqual(await readdir(f.output), filesBefore);
  assert.equal(f.driver.context.pages().some(page => page !== f.driver.page && !page.isClosed()), false);
});

test('opening another question dismisses an overlapping dropdown without choosing its answer', async t => {
 const f=await fixture(t);
 await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2>
 <label>Clearance<input role="combobox" aria-expanded="true" aria-controls="clearance-list" onkeydown="if(event.key==='Escape'){this.setAttribute('aria-expanded','false');document.getElementById('clearance-list').hidden=true}"></label>
 <div id="clearance-list" role="listbox" style="position:fixed;inset:0;z-index:5;background:white"><div role="option">Top Secret</div></div>
 <label>Source<input role="combobox" aria-expanded="false" onclick="this.setAttribute('aria-expanded','true')"></label>`);
 await f.driver.snapshot();
 const ref=[...f.driver.refs.values()].find(t=>t.control.label==='Source').control.ref;
 await f.driver.act({kind:'click',ref,source:'unanswered',value:'',explanation:'Inspect the next question'});
 assert.equal(await f.driver.page.getByLabel('Clearance').inputValue(),'');
 assert.equal(await f.driver.page.getByLabel('Source').getAttribute('aria-expanded'),'true');
 assert.equal(await f.driver.page.locator('#clearance-list').isVisible(),false);
});

test('Greenhouse required checkbox choices accept one answer but still require standalone consent', async t => {
  const f = await fixture(t);
  const url = 'https://job-boards.greenhouse.io/fixture/jobs/123';
  await f.driver.page.route(url, route => route.fulfill({ contentType: 'text/html', body: `<h1>Fixture Company</h1><h2>Support Engineer</h2><form novalidate onsubmit="event.preventDefault()">
    <label>Resume<input name="resume" type="file" required></label>
    <label>Company Website<input type="checkbox" name="source[]" required aria-invalid="false" aria-errormessage="source-error"></label>
    <label>Conference<input type="checkbox" name="source[]" required aria-invalid="false" aria-errormessage="source-error"></label>
    <label>Consent<input type="checkbox" name="consent" required></label>
    <button type="submit">Submit application</button></form>` }));
  f.driver.job.destination = url;
  await f.driver.page.goto(url); await f.driver.snapshot();
  const action = (kind, label, value = '') => ({ kind, ref: f.ref(label), value, source: 'saved_profile' });
  await f.driver.act(action('upload', 'Resume')); await f.driver.snapshot();
  await assert.rejects(f.driver.act(action('submit', 'Submit application')), /source/);
  await f.driver.act(action('check', 'Company Website', 'true')); await f.driver.snapshot();
  await assert.rejects(f.driver.act(action('submit', 'Submit application')), /consent/);
  await f.driver.act(action('check', 'Consent', 'true')); await f.driver.snapshot();
  await f.driver.act(action('submit', 'Submit application'));
  assert.equal(f.boundary(), 1);
  assert.equal(await f.driver.page.getByLabel('Conference').isChecked(), false);
});


test('snapshot retries navigation races without replaying form actions and bounds repeated failures', async t => {
  const f = await fixture(t);
  const read = f.driver.snapshotOnce.bind(f.driver);
  let reads = 0;
  f.driver.snapshotOnce = async () => {
    if (++reads === 1) {
      f.driver.questions.push({ question: 'Stale page', answer: 'Discard me', source: 'existing_answer' });
      throw new Error('frame.evaluate: Execution context was destroyed, most likely because of a navigation');
    }
    return read();
  };
  assert.equal((await f.driver.snapshot()).identityVerified, true);
  assert.equal(reads, 2);
  assert.equal(f.driver.questions.some(q => q.question === 'Stale page'), false);
  assert.equal(f.boundary(), 0); assert.equal(f.submissions(), 0);
  reads = 0;
  f.driver.snapshotOnce = async () => { reads++; throw new Error('Frame was detached'); };
  await assert.rejects(f.driver.snapshot(), /Frame was detached/);
  assert.equal(reads, 3); assert.equal(f.driver.refs.size, 0);
  assert.equal(f.driver.identityVerified, false);
  reads = 0;
  f.driver.snapshotOnce = async () => { reads++; throw new Error('Unrelated failure'); };
  await assert.rejects(f.driver.snapshot(), /Unrelated failure/);
  assert.equal(reads, 1); assert.equal(f.boundary(), 0);
});

test('custom onclick apply controls work while final submit controls remain guarded',async t=>{
 const f=await fixture(t);
 await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><div onclick="this.insertAdjacentHTML('afterend','<label>Full name<input name=name></label>');this.remove()">Apply for this Position</div><div onclick="window.fakeSubmitted=true">Submit application</div>`);
 await f.driver.snapshot();
 const apply=f.ref('Apply for this Position');assert.ok(apply);
 await f.driver.act({kind:'click',ref:apply,value:'',source:'job_policy',explanation:'Open the visible employer application'});
 await f.driver.snapshot();assert.ok(f.ref('Full name'));
 await assert.rejects(f.driver.act({kind:'click',ref:f.ref('Submit application'),value:'',source:'job_policy'}),/guarded submit/);
 assert.equal(await f.driver.page.evaluate(()=>!!window.fakeSubmitted),false);assert.equal(f.submissions(),0);
});

test('form plans bind repeated Yes answers to stable question IDs and still reject unnamed duplicates',async t=>{
 const{executeFormPlan}=await import('../../scripts/application-browser/form-plan.mjs');const f=await fixture(t);
 await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><div id="experience-yes" onclick="this.dataset.chosen='true'">Yes</div><div id="location-yes" onclick="this.dataset.chosen='true'">Yes</div>`);
 const snap=await f.driver.snapshot();const yes=snap.frames.flatMap(f=>f.controls).filter(c=>c.label==='Yes');assert.equal(yes.length,2);
 await executeFormPlan(f.driver,[{kind:'click',ref:yes[1].ref,value:'',source:'saved_profile'}]);
 assert.equal(await f.driver.page.locator('#location-yes').getAttribute('data-chosen'),'true');assert.equal(await f.driver.page.locator('#experience-yes').getAttribute('data-chosen'),null);
 await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2><div onclick="this.dataset.chosen='true'">Yes</div><div onclick="this.dataset.chosen='true'">Yes</div>`);
 const ambiguous=await f.driver.snapshot();const c=ambiguous.frames.flatMap(f=>f.controls).find(c=>c.label==='Yes');
 await assert.rejects(executeFormPlan(f.driver,[{kind:'click',ref:c.ref,value:'',source:'saved_profile'}]),/ambiguous/);assert.equal(f.submissions(),0);
});

test('Paycor screening choices expose and retain confirmed answers by question group',async t=>{
 const f=await fixture(t);const {executeFormPlan}=await import('../../scripts/application-browser/form-plan.mjs');
 await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2>${['Experience','Worksite'].map((q,i)=>`<div class="gnewtonQuestionWrapper">${q}<input type="hidden" id="q${i}" value=""><div class="gnewtonQuestionYes"><div id="y_q${i}" class="gnewtonYes" onclick="document.getElementById('q${i}').value='true';this.classList.add('isSelected')">Yes</div></div><div class="gnewtonQuestionNo"><div id="n_q${i}" class="gnewtonNo" onclick="document.getElementById('q${i}').value='false';this.classList.add('isSelected')">No</div></div></div>`).join('')}`);
 let s=await f.driver.snapshot();let yes=s.frames.flatMap(f=>f.controls).filter(c=>c.label==='Yes');assert.equal(yes.length,2);assert.equal(yes[0].context,'Experience');
 await assert.rejects(f.driver.act({kind:'click',ref:yes[0].ref,value:'true',source:'saved_profile'}),/guarded check/);
 await executeFormPlan(f.driver,yes.map(c=>({kind:'check',ref:c.ref,value:'true',source:'saved_profile'})));
 s=await f.driver.snapshot();yes=s.frames.flatMap(f=>f.controls).filter(c=>c.label==='Yes');assert.ok(yes.every(c=>c.checked===true));assert.equal(f.driver.questions.length,2);assert.ok(f.driver.questions.every(q=>q.answer==='Yes'));
 const no=s.frames.flatMap(f=>f.controls).find(c=>c.label==='No');await assert.rejects(f.driver.act({kind:'check',ref:no.ref,value:'true',source:'saved_profile'}),/Existing selection/);assert.equal(f.submissions(),0);
});

test('routine contact batch fills confirmed mobile and preferred name without touching duplicate or existing answers', async t => {
  const {executeFormPlan,routineContactActions}=await import('../../scripts/application-browser/form-plan.mjs');
  const f=await fixture(t);
  await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><label>Mobile Phone<input type="tel"></label><label>Preferred Name<input type="text"></label><label>First Name<input></label><label>First Name<input></label><label>Email<input value="existing@example.test"></label>');
  const actions=routineContactActions(await f.driver.snapshot(),{phone:'5551234567',preferredName:'Test',firstName:'Duplicate',email:'new@example.test'});
  assert.equal(actions.length,2);
  await executeFormPlan(f.driver,actions);
  assert.equal(await f.driver.page.getByLabel('Mobile Phone').inputValue(),'5551234567');
  assert.equal(await f.driver.page.getByLabel('Preferred Name').inputValue(),'Test');
  assert.deepEqual(await f.driver.page.getByLabel('First Name',{exact:true}).evaluateAll(els=>els.map(el=>el.value)),['','']);
  assert.equal(await f.driver.page.getByLabel('Email').inputValue(),'existing@example.test');
  assert.equal(f.boundary(),0);
});

test('confirmed former employment corrects only its scoped parsed current-employer flag',async t=>{
 const f=await fixture(t);f.driver.job.onboarding={employmentHistory:{former:{employer:'Former University',currentEmployer:false,endDate:'2025-08-24',confirmedAt:'2026-10-21',source:'Candidate confirmation'},current:{employer:'Current Company',currentEmployer:true,endDate:null,confirmedAt:'2026-10-21',source:'Candidate confirmation'}}};
 await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><form><section><input value="Former University"><label>Current employer<input type="checkbox" checked id="former"></label></section><section><input value="Current Company"><label>Current employer<input type="checkbox" checked id="current"></label></section><label>Agree to terms<input type="checkbox" checked id="consent"></label></form>');
 const act=async(id,source='saved_profile')=>{await f.driver.snapshot();const target=[...f.driver.refs.values()].find(t=>t.control.id===id);return f.driver.act({kind:'check',ref:target.control.ref,value:'false',source,explanation:'Confirmed employment history correction'});};
 await assert.rejects(act('former','approved_resume'),/Existing selection/);
 await act('former');assert.equal(await f.driver.page.locator('#former').isChecked(),false);
 await assert.rejects(act('current'),/Existing selection/);
 await assert.rejects(act('consent'),/Existing selection/);
 await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><fieldset><legend>Currently employed</legend><input value="Former University"><label>I certify the dates are accurate<input type="checkbox" checked id="certification"></label></fieldset>');
 await assert.rejects(act('certification'),/Existing selection/);assert.equal(await f.driver.page.locator('#certification').isChecked(),true);
 await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><section><input value="Former University"><div class="gnewtonQuestionWrapper">Currently employed<input type="checkbox" checked id="gnewton_section_120_question_60_answer"></div></section>');
 await act('gnewton_section_120_question_60_answer');assert.equal(await f.driver.page.locator('input[type=checkbox]').isChecked(),false);
 assert.equal(f.boundary(),0);
});

test('next application uses a fresh tab without disturbing a parked submission or its state',async t=>{
 const f=await fixture(t);const pending=f.driver;
 pending.submissionStarted=true;pending.uploadVerified=true;pending.questions=[{label:'First job only'}];
 const originalPage=pending.page;const originalUrl=originalPage.url();
 const next=await ApplicationBrowser.launch({existingContext:pending.context,job:{...f.job,title:'Other role'},resumePath:f.resumePath,outputDirectory:f.output,profileDirectory:path.join(f.directory,'profile'),headless:true,checkpoint:async()=>{},beforeSubmit:async()=>{}});
 assert.notEqual(next.page,originalPage);assert.equal(originalPage.isClosed(),false);assert.equal(originalPage.url(),originalUrl);
 assert.equal(next.submissionStarted,false);assert.equal(next.uploadVerified,false);assert.deepEqual(next.questions,[]);
 assert.equal(pending.submissionStarted,true);assert.equal(pending.uploadVerified,true);assert.equal(f.submissions(),0);
});

test('failed next-page navigation retains the browser session and pending application for a subsequent job',async t=>{
 const f=await fixture(t);const page=f.driver.page;const url=page.url();
 const options={existingContext:f.driver.context,job:{...f.job,destination:'not a valid URL'},resumePath:f.resumePath,outputDirectory:f.output,profileDirectory:path.join(f.directory,'profile'),headless:true,checkpoint:async()=>{},beforeSubmit:async()=>{}};
 await assert.rejects(ApplicationBrowser.launch(options));
 assert.equal(page.isClosed(),false);assert.equal(page.url(),url);
 const next=await ApplicationBrowser.launch({...options,job:f.job});
 assert.notEqual(next.page,page);assert.equal(page.isClosed(),false);assert.equal(f.submissions(),0);
});

test('resuming a parked sign-in tab returns to the bound job and never inherits upload authorization',async t=>{
 const {AccessPages}=await import('../../scripts/application-browser/access-pages.mjs');
 const f=await fixture(t);Object.assign(f.job,{applicationId:'access-fixture',attemptId:'old'});
 await f.driver.page.locator('input[name=name]').fill('Existing Person');
 await f.driver.context.addCookies([{name:'fixture_session',value:'signed-in',url:f.job.destination}]);
 f.driver.uploadVerified=true;
 const pages=new AccessPages();pages.retain(f.job,f.driver,{status:'BLOCKED',summary:'Sign-in required'});
 const job={...f.job,attemptId:'new'};
 await f.driver.page.goto('about:blank');
 const retained=pages.take(job,f.driver.context);
 const resumed=await ApplicationBrowser.launch({existingContext:f.driver.context,existingPage:retained,job,resumePath:f.resumePath,outputDirectory:f.output,profileDirectory:path.join(f.directory,'profile'),headless:true,checkpoint:async()=>{},beforeSubmit:async()=>{}});
 assert.equal(resumed.page,f.driver.page);
 assert.equal(await resumed.page.locator('input[name=name]').inputValue(),'');
 assert.equal(new URL(resumed.page.url()).origin,new URL(job.destination).origin);
 assert.ok((await resumed.context.cookies()).some(c=>c.name==='fixture_session'&&c.value==='signed-in'));
 assert.equal(resumed.uploadVerified,false);assert.equal(resumed.identityVerified,false);assert.equal(resumed.submissionStarted,false);
 await resumed.snapshot();
 const submit=[...resumed.refs.values()].find(item=>item.control.label==='Submit application').control.ref;
 await assert.rejects(resumed.act({kind:'submit',ref:submit}),/attachment/);
 assert.equal(f.submissions(),0);
});

test('Chosen dropdowns bind duplicate options to their source questions and verify retained values',async t=>{
 const f=await fixture(t);const {executeFormPlan}=await import('../../scripts/application-browser/form-plan.mjs');
 await f.driver.page.setContent(`<h1>Fixture Company</h1><h2>Support Engineer</h2>${['Sponsorship','Age 18'].map((q,i)=>`<div class="form-group"><label>${q}</label><select style="display:none" data-placeholder="${q}" id="q${i}"><option value=""></option><option value="true">Yes</option><option value="false">No</option></select><div class="chosen-container" id="q${i}_chosen"><a class="chosen-single" onclick="this.parentElement.classList.add('chosen-with-drop');this.nextElementSibling.style.display='block'"><span>${q}</span></a><ul class="chosen-results" style="display:none"><li class="active-result" onclick="document.getElementById('q${i}').value='true';this.parentElement.style.display='none'">Yes</li><li class="active-result" onclick="document.getElementById('q${i}').value='false';this.parentElement.style.display='none'">No</li></ul><input class="chosen-search-input"></div></div>`).join('')}`);
 let snap=await f.driver.snapshot();let controls=snap.frames.flatMap(f=>f.controls);assert.equal(controls.filter(c=>c.chosen).length,2);assert.equal(controls.filter(c=>c.tag==='input').length,0);
 await executeFormPlan(f.driver,controls.filter(c=>c.chosen).map(c=>({kind:'choose',ref:c.ref,value:c.label==='Sponsorship'?'No':'Yes',source:'saved_profile'})));
 assert.equal(await f.driver.page.locator('#q0').inputValue(),'false');assert.equal(await f.driver.page.locator('#q1').inputValue(),'true');
 snap=await f.driver.snapshot();const c=snap.frames.flatMap(f=>f.controls).find(c=>c.label==='Sponsorship');
 await assert.rejects(f.driver.act({kind:'choose',ref:c.ref,value:'Yes',source:'saved_profile'}),/Existing selection/);
 assert.equal(f.submissions(),0);
});

 test('native submit input uses its visible value instead of internal commit name',async t=>{
 const f=await fixture(t);await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><input type="submit" name="commit" value="Submit Application"><input name="answer" value="Submit Application">');
 const snap=await f.driver.snapshot();const controls=snap.frames.flatMap(f=>f.controls);
 const submit=controls.find(c=>c.type==='submit');assert.equal(submit.label,'Submit Application');assert.equal(controls.find(c=>c.name==='answer').label,'answer');
 await assert.rejects(f.driver.act({kind:'click',ref:submit.ref}),/guarded submit/);
 await assert.rejects(f.driver.act({kind:'submit',ref:submit.ref}),/attachment/);assert.equal(f.boundary(),0);
 });

test('bound cover letter is separate from the resume and required at final submission',async t=>{
 const f=await fixture(t);const coverPath=path.join(f.directory,'Cover_Letter.pdf');const bytes=Buffer.from('%PDF-1.4\nverified-cover-letter');await writeFile(coverPath,bytes);
 f.driver.job.coverLetter={path:coverPath,sha256:sha256(bytes)};
 await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><form method="post" enctype="multipart/form-data"><label>Resume<input type="file" name="resume"></label><label>Cover Letter<input type="file" name="cover"></label><button type="submit">Submit application</button></form>');
 await f.driver.snapshot();await f.driver.act({kind:'upload',ref:f.ref('Resume')});await f.driver.snapshot();
 await assert.rejects(f.driver.act({kind:'submit',ref:f.ref('Submit application')}),/cover letter attachment/);
 await f.driver.act({kind:'upload',ref:f.ref('Cover Letter')});assert.equal(f.driver.uploadVerified,true);
 await f.driver.snapshot();await f.driver.act({kind:'submit',ref:f.ref('Submit application')});await f.driver.page.waitForURL('**/received');assert.equal(f.submissions(),1);
});

test('resume import can restore only a contact value this attempt entered from confirmed facts',async t=>{
 const f=await fixture(t);await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><label>Primary Residence City<input id="city"></label><label>Salary<input id="salary" value="100000"></label><label>Resume<input type="file" name="resume"></label>');
 await f.driver.snapshot();await f.driver.act({kind:'fill',ref:f.ref('Primary Residence City'),value:'Seal Beach',source:'saved_profile'});
 await f.driver.snapshot();await f.driver.act({kind:'upload',ref:f.ref('Resume')});
 await f.driver.page.locator('#city').fill('Los Angeles');await f.driver.snapshot();
 await assert.rejects(f.driver.act({kind:'fill',ref:f.ref('Primary Residence City'),value:'Irvine',source:'saved_profile'}),/Existing answer/);
 await f.driver.act({kind:'fill',ref:f.ref('Primary Residence City'),value:'Seal Beach',source:'saved_profile'});assert.equal(await f.driver.page.locator('#city').inputValue(),'Seal Beach');
 await assert.rejects(f.driver.act({kind:'fill',ref:f.ref('Salary'),value:'80000',source:'saved_profile'}),/Existing answer/);assert.equal(f.boundary(),0);
});

test('maxlength rejects an overlong answer before the browser truncates it',async t=>{
 const f=await fixture(t);await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><label>Desired salary<input maxlength="10" id="salary"></label>');await f.driver.snapshot();
 await assert.rejects(f.driver.act({kind:'fill',ref:f.ref('Desired salary'),value:'$84000 annually',source:'job_policy'}),/exceeds 10/);assert.equal(await f.driver.page.locator('#salary').inputValue(),'');
 await f.driver.act({kind:'fill',ref:f.ref('Desired salary'),value:'84000',source:'job_policy'});assert.equal(await f.driver.page.locator('#salary').inputValue(),'84000');
});

test('malformed email correction uses only the exact saved email and preserves different valid addresses',async t=>{
 const f=await fixture(t);f.driver.job.profile={email:'candidate@example.com'};await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><label>Email<input id="email" value="pp"></label>');await f.driver.snapshot();
 await assert.rejects(f.driver.act({kind:'fill',ref:f.ref('Email'),value:'other@example.com',source:'saved_profile'}),/Existing answer/);
 await f.driver.act({kind:'fill',ref:f.ref('Email'),value:'candidate@example.com',source:'saved_profile'});
 await f.driver.page.locator('#email').fill('different@example.com');await f.driver.snapshot();await assert.rejects(f.driver.act({kind:'fill',ref:f.ref('Email'),value:'candidate@example.com',source:'saved_profile'}),/Existing answer/);
});

test('document upload is identified as supplemental cover only when its section explicitly permits cover letters',async t=>{
 const f=await fixture(t);await f.driver.page.setContent('<div id="portal_divDocUpload"><h4>Document Upload</h4><p>You may upload cover letters here.</p><input type="file" id="portal_DocUploadfile0"></div><input type="file" id="other_DocUploadfile0">');const snap=await f.driver.snapshot();const files=snap.frames.flatMap(f=>f.controls).filter(c=>c.type==='file');assert.equal(files[0].label,'Additional documents (cover letter)');assert.notEqual(files[1].label,'Additional documents (cover letter)');
});


test('Hirebridge cleared file input keeps byte-bound receipt within its resume section only',async t=>{
 const f=await fixture(t);await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><div id="portal_resumeUploadHtml" class="hbsection"><h4>Upload Your Resume or Cover Letter Merged with Resume</h4><div><div><input type="file" id="uploadedresume" aria-label="Resume"></div></div><div id="receipt"></div></div><div id="outside"></div>');
 await f.driver.snapshot();await f.driver.act({kind:'upload',ref:f.ref('Resume')});
 await f.driver.page.evaluate(name=>{document.querySelector('#receipt').textContent=name;document.querySelector('#uploadedresume').value='';},path.basename(f.resumePath));
 assert.equal((await f.driver.snapshot()).attachmentPresent,true);
 await f.driver.page.evaluate(()=>{document.querySelector('#outside').textContent=document.querySelector('#receipt').textContent;document.querySelector('#receipt').textContent='';});
 assert.equal((await f.driver.snapshot()).attachmentPresent,false);
 assert.equal(f.boundary(),0);
});


test('confirmed residence-city correction requires both scoped answer and matching saved city',async t=>{
 const f=await fixture(t);f.driver.job.profile={city:'Seal Beach'};await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><label>Current Primary Residence City<input id="city" value="Los Angeles"></label>');await f.driver.snapshot();
 await assert.rejects(f.driver.act({kind:'fill',ref:f.ref('Current Primary Residence City'),value:'Seal Beach',source:'saved_profile'}),/Existing answer/);
 f.driver.job.confirmedAnswers=[{question:'Current Primary Residence City',answer:'Seal Beach'}];
 await assert.rejects(f.driver.act({kind:'fill',ref:f.ref('Current Primary Residence City'),value:'Irvine',source:'saved_profile'}),/Existing answer/);
 await f.driver.act({kind:'fill',ref:f.ref('Current Primary Residence City'),value:'Seal Beach',source:'saved_profile'});assert.equal(await f.driver.page.locator('#city').inputValue(),'Seal Beach');
});


test('Hirebridge asynchronous region replacement retains upload proof and later file selection revokes it',async t=>{
 const f=await fixture(t);await f.driver.page.setContent('<h1>Fixture Company</h1><h2>Support Engineer</h2><div id="portal_resumeUploadHtml"><h4>Upload Your Resume</h4><input id="uploadedresume" type="file" aria-label="Resume"></div>');
 await f.driver.snapshot();await f.driver.act({kind:'upload',ref:f.ref('Resume')});
 await f.driver.page.evaluate(name=>{document.querySelector('#portal_resumeUploadHtml').outerHTML='<div id="portal_resumeUploadHtml"><h4>Upload Your Resume</h4><input id="uploadedresume" type="file" aria-label="Resume"><span>'+name+'</span></div>';},path.basename(f.resumePath));
 assert.equal((await f.driver.snapshot()).attachmentPresent,true);
 await f.driver.page.locator('#uploadedresume').setInputFiles({name:path.basename(f.resumePath),mimeType:'application/pdf',buffer:Buffer.from('%PDF-wrong')});
 assert.equal((await f.driver.snapshot()).attachmentPresent,false);assert.equal(f.boundary(),0);
});
