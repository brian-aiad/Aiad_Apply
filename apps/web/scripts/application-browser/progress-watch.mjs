// Ignore ephemeral refs and open menus; count progress in committed answers.
export class ProgressWatch {
  constructor() { this.last = ''; this.stalled = 0; }
  observe(snapshot) {
    const state = JSON.stringify([snapshot.url,snapshot.resumeUploaded,snapshot.submissionStarted,snapshot.frames.map(f=>[f.url,f.controls.filter(c=>['input','textarea','select'].includes(c.tag) && c.type !== 'hidden').map(c=>[c.label,c.value,c.checked,c.files])])]);
    this.stalled = state === this.last ? this.stalled + 1 : 0;
    this.last = state;
    return this.stalled;
  }
}
