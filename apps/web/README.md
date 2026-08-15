# AiadApply Web

Private Next.js dashboard for capturing application-support jobs, queuing local
résumé tailoring runs, reviewing exact changes, downloading artifacts, and tracking
application outcomes.

## Local development

From the repository root, the supported launcher starts both the dashboard and local
Python worker:

```powershell
.\scripts\start-local.ps1
```

Run the web application by itself from this directory:

```powershell
npm install
npm run dev
```

## Environment

The server requires `DATABASE_URL` and `DIRECT_URL`. Artifact upload/download uses
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Worker routes require
`WORKER_SECRET` or `CRON_SECRET`.

Production requests are protected with HTTP Basic authentication. Set
`AIADAPPLY_PASSWORD`; `AIADAPPLY_USERNAME` is optional and defaults to `brian`. The
application fails closed in production when the password is missing. Local development
does not show an authentication prompt.

## Validation

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

Playwright tests exercise database-backed capture, duplicate handling, source-link
extraction, status updates, authenticated worker progress, mobile navigation, and
protected worker routes. Fixture records are removed before and after the suite.
