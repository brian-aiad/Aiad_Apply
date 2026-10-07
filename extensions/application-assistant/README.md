# AiadApply Assistant

Load this directory as an unpacked Chrome extension from `chrome://extensions`.
The app's `/apply-help` page explains the end-user workflow.

The extension accepts a job-specific packet from the Apply tab, validates its PDF
fingerprint and expiry, and runs only after a toolbar action using `activeTab`.
There are no host permissions, background scripts, server credentials, or external
network requests. Imported data lives in Chrome session storage until cleared or
the browser session ends. No website can ask it to read the local app.

It previews standard contact text inputs and an unambiguous resume upload, then
fills only empty inputs. Replacing an existing resume requires its own checkbox.
It does not fill custom controls, work history, screening/eligibility questions,
consents or demographics. It never calls submit or clicks a page button. URLs must
match the same job path and identity query parameters. Cross-origin iframes and
redirected logins need Simplify/manual handling.

Tests: `node --test extensions/application-assistant/tests/*.test.mjs`.
Browser behavior is also verified with the actual exported `inspectAndFill` function
on a local representative employer form; no live employer submissions are made.
