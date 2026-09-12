# Teluria

Architectural project workspaces with a 2D editor, procedural 3D model, educational seismic visualization, and project delivery management.

## Run locally

Requires Node.js 24 or later (native SQLite), npm, and a writable local disk.

```bash
npm install
npm run dev
npm run lint
npm run build
```

Open `/projects`. On the first visit, create the studio owner's account with your own password. That first account receives ownership of migrated projects. Subsequent accounts only see projects they create or join through an invitation. Do not expose initial setup on a public network.

## Stage 2

- Real local authentication: salted scrypt passwords, hashed session tokens, HttpOnly cookies, project-specific roles.
- Team membership and expiring, revocable invitation links (manual sharing; no email is sent).
- Project calendar, studio-wide agenda, task dependencies, computed Gantt and basic critical path.
- Discussions linked to projects, tasks, document versions or semantic elements.
- Shared delivery packages, assigned client reviews and a restricted client portal.
- Author-attributed change log, personal project notifications and PDF status reports.
- Supplier/stage cost metadata and visual raster-version overlay.
- Shared semantic geometry through REST with optimistic revision checks.

## Persistence and migration

Next.js hosts the Node REST API; an external backend service is not required. SQLite lives at `.data/teluria.sqlite`, ignored by Git. On the first database initialization it imports `.data/workspace-db.json` if present, otherwise `data/workspace-db.json`. The old JSON is preserved unchanged.

Stop the server before backing up the entire `.data` directory (including SQLite WAL files when present). Browser-only legacy projects are imported only for the first owner; original browser data is not deleted. Blueprint migration is restricted to each project's owner.

Profile, preferences, terrain settings and educational simulation preferences still use browser-local adapters. There is no simultaneous co-editing: stale shared-plan writes are rejected instead of overwriting another user's changes. Refresh before continuing after a conflict.

## Verification

Start an isolated server in PowerShell:

```powershell
$env:TELURIA_TEST_MODE='1'
npm run dev -- --hostname 127.0.0.1 --port 3010
```

In a second terminal:

```bash
npm run test:workspace
npm run test:collaboration
```

Tests verify the test-mode response header before writing. QA records remain exclusively in `.data/qa/teluria.sqlite`; no test account is created in the normal database. Both suites retain their generated QA projects for inspection.

## Limits

This is a local studio release, not a public SaaS deployment. Before publishing: add verified email/password recovery, hardened signup controls, centralized rate limiting, TLS/reverse-proxy configuration, automated encrypted backups and scalable document storage. Notifications are in-app and refresh every 30 seconds or on window focus; there is no email or websocket delivery.

The Gantt uses finish-to-start dependencies and calendar days, without resource leveling. Version overlay compares raster images visually, not PDFs or semantic diffs. Seismic response and plan detection remain educational demonstrations, not professional structural analysis.

See [stage 2 acceptance notes](docs/stage-two.md), [architecture](docs/architecture.md), and [REST contracts](docs/rest-api.md).
