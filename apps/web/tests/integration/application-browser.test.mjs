import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import { ApplicationBrowser, sha256 } from '../../scripts/application-browser/driver.mjs';
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
  assert.equal(f.submissions(), 0, 'email verification must not reissue the application submit');
});
