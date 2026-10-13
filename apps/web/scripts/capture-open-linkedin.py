"""Capture the user's already-open LinkedIn search; never navigate or run page JS.

macOS assisted action only. Raw page data stays in a private temporary directory
and is removed before exit. Output is consumed locally by the offline parser.
"""
import email.policy
import json
import pathlib
import subprocess
import sys
import tempfile
import time
from email.parser import BytesParser

if sys.platform != "darwin":
    raise SystemExit("Open-page capture currently requires macOS. Use pasted job details on this device.")
with tempfile.TemporaryDirectory(prefix="aiadapply-linkedin-capture-") as directory:
    target = pathlib.Path(directory) / "search.mhtml"
    script = """const c=Application('Google Chrome'); let result=null;
for(const w of c.windows()) { for(const t of w.tabs()) {
 const u=t.url();
 if(/^https:\\/\\/(?:www\\.)?linkedin\\.com\\/jobs\\/search(?:-results)?\\//.test(u)) {
  t.save({in:Path(TARGET),as:'single file'});
  result={url:u}; break;
 }
} if(result) break; }
JSON.stringify(result);""".replace("TARGET", json.dumps(str(target)))
    result = subprocess.run(["osascript", "-l", "JavaScript", "-e", script], capture_output=True, text=True, timeout=15, check=False)
    if result.returncode:
        raise SystemExit("Chrome did not permit saving the open search. Check macOS Automation access.")
    info = json.loads(result.stdout or "null")
    if not info:
        raise SystemExit("No open LinkedIn search was found in Chrome. Open your saved search first.")
    previous = -1
    for _ in range(40):
        size = target.stat().st_size if target.exists() else 0
        if size > 0 and size == previous:
            break
        previous = size
        time.sleep(0.25)
    else:
        raise SystemExit("Chrome did not finish saving the open search.")
    if size > 30_000_000:
        raise SystemExit("The saved page is too large to capture safely.")
    message = BytesParser(policy=email.policy.default).parsebytes(target.read_bytes())
    part = next((part for part in message.walk() if part.get_content_type() == "text/html"), None)
    if part is None:
        raise SystemExit("The saved search contains no HTML document.")
    # Chrome's MHTML can declare a legacy charset while its serialized DOM is UTF-8.
    html = part.get_payload(decode=True).decode("utf-8", errors="strict")
    print(json.dumps({"url": info["url"], "html": html}))
