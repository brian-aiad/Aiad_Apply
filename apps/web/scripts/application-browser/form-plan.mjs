// Page plans are scoped to the observed question and frame, never stale refs.
const normal = text => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
const signature = control => JSON.stringify([control.tag, control.type, control.role, control.label, control.context]);
export async function executeFormPlan(driver, actions) {
  const planned = actions.map(action => {
    if (action.kind === 'wait') return { action };
    const target = driver.ref(action.ref);
    return { action, frame: target.frame, url: target.frame.url(), signature: signature(target.control) };
  });
  for (const item of planned) {
    if (item.action.kind === 'wait') { await driver.act(item.action); continue; }
    await driver.snapshot();
    if (item.frame.isDetached() || item.frame.url() !== item.url) throw new Error('The planned form navigated; inspect it again before continuing.');
    const matches = [...driver.refs.values()].filter(t => t.frame === item.frame && signature(t.control) === item.signature);
    if (matches.length !== 1) throw new Error('A planned question changed or became ambiguous; inspect the current form.');
    await driver.act({ ...item.action, ref: matches[0].control.ref });
    if (['click', 'upload', 'submit'].includes(item.action.kind)) break;
  }
}

export function routineContactActions(snapshot, profile) {
  if (!snapshot.identityVerified || snapshot.submissionStarted) return [];
  const keys = new Map([['first name','firstName'],['last name','lastName'],['email','email'],['email address','email'],['phone','phone'],['phone number','phone'],['linkedin profile','linkedin'],['website','portfolio']]);
  const all = snapshot.frames.flatMap(f => f.controls);
  const actions = [];
  for (const c of all) {
    const label = normal(c.label).replace(/\s*\*$/, '');
    const key = keys.get(label);
    if (!key || !profile[key] || c.disabled || c.value || c.role === 'combobox' || !['text','email','tel','url',''].includes(c.type) || c.tag !== 'input') continue;
    if (all.filter(other => normal(other.label).replace(/\s*\*$/, '') === label && other.tag === 'input').length !== 1) continue;
    actions.push({kind:'fill',ref:c.ref,value:profile[key],source:'saved_profile',explanation:`Use the saved ${key} for the matching contact field.`});
  }
  return actions;
}
