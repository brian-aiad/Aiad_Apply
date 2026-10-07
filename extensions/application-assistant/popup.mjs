import { validatePacket, matchesApplicationUrl } from './packet.mjs';
import { inspectAndFill } from './autofill.mjs';
const $ = id => document.getElementById(id);
let packet = null, preview = null, tabId = null, previewUrl = null;
const status = text => { $('status').textContent = text; };
function resetPreview() { preview = null; $('fill').disabled = true; $('preview-result').replaceChildren(); $('replace-label').hidden = true; $('replace').checked = false; }
function render() {
  $('job').hidden = !packet; resetPreview(); $('confirm').checked = false;
  if (!packet) return;
  $('title').textContent = packet.title; $('company').textContent = packet.company;
  $('resume').textContent = `Version ${packet.runNumber} · ${packet.resume.fileName}`;
  $('host').textContent = new URL(packet.targetUrl).hostname;
}
async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !matchesApplicationUrl(packet.targetUrl, tab.url)) throw Error('This page does not match the packet’s job link. Open the exact employer application or use Simplify and attach the PDF manually.');
  return tab;
}
async function run(fill) {
  if (!packet || !$('confirm').checked) throw Error('Confirm that this is the intended job first.');
  packet = await validatePacket(packet);
  const tab = await currentTab();
  if (fill && (tab.id !== tabId || tab.url !== previewUrl)) throw Error('The page changed. Preview it again.');
  const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: inspectAndFill, args: [{ contact: packet.contact, resume: packet.resume, fill, replaceResume: $('replace').checked, expected: fill ? preview.signature : null }] });
  if (!result[0]?.result || result[0].result.error) throw Error(result[0]?.result?.error || 'The page could not be read. Use Simplify or fill manually.');
  return { data: result[0].result, tab };
}
$('packet').addEventListener('change', async event => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 8_000_000) throw Error('This file is too large to be an application packet.');
    packet = await validatePacket(JSON.parse(await file.text()));
    await chrome.storage.session.set({ packet }); render(); status('Check the job above, then preview the current form.');
  } catch (error) { packet = null; await chrome.storage.session.remove('packet'); render(); status(error.message); }
});
$('confirm').addEventListener('change', resetPreview);
$('preview').addEventListener('click', async () => {
  resetPreview();
  try {
    const { data, tab } = await run(false); preview = data; tabId = tab.id; previewUrl = tab.url;
    const list = document.createElement('ul');
    for (const field of data.fields) { const row = document.createElement('li'); row.textContent = `${field.label}: ${field.value}`; list.append(row); }
    for (const field of data.skipped) { const row = document.createElement('li'); row.textContent = `${field.label}: ${field.reason}`; list.append(row); }
    $('preview-result').append(list);
    $('replace-label').hidden = !data.upload?.existing;
    status(`${data.fields.length} contact fields recognized. ${data.upload ? `Resume field: ${data.upload.label}${data.upload.existing ? ` (currently ${data.upload.existing})` : ''}.` : data.uploadMessage}`);
    $('fill').disabled = !data.fields.length && !data.upload;
  } catch (error) { status(error.message); }
});
$('fill').addEventListener('click', async () => {
  $('fill').disabled = true;
  try { const { data } = await run(true); resetPreview(); status(`Filled ${data.filled} contact fields. ${data.attached ? 'Reviewed PDF attached.' : 'PDF not attached; upload it manually if needed.'} Check all answers and the attachment before you submit.`); }
  catch (error) { resetPreview(); status(error.message); }
});
$('clear').addEventListener('click', async () => { await chrome.storage.session.remove('packet'); packet = null; render(); status('Packet cleared from this browser session.'); });
try { const saved = await chrome.storage.session.get('packet'); if (saved.packet) { packet = await validatePacket(saved.packet); render(); } }
catch { await chrome.storage.session.remove('packet'); status('Prepare and import a fresh packet.'); }
