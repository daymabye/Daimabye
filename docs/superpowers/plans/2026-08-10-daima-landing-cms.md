# Daima Landing CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Supabase-backed Daima landing CMS in four independently deployable vertical phases, with the admin panel as the only price/content authority and a safe offline bot cache.

**Architecture:** Keep the existing Vercel static shell and admin session. Add a Supabase canonical content/revision layer and authenticated server endpoints; the public landing reads a published bundle and falls back to the last bundled revision. The bot receives a validated versioned catalog and stores the last good snapshot in SQLite for offline operation.

**Tech Stack:** Existing Node.js ESM serverless functions, Vercel, Supabase Postgres/Storage, existing signed-cookie admin session, SQLite/better-sqlite3 in Daima bot, Node test runner or repository test runner.

## Global Constraints

- Supabase is canonical for landing content and service prices after cutover.
- The admin panel is the only write surface for prices.
- No FivIA, FivIA VPS files, Supabase FivIA project, Agenda, or WhatsApp accounts may be touched.
- Preserve the current landing layout unless content rendering requires a minimal adapter.
- All writes require admin authorization, validation, optimistic concurrency, audit logging, and rate limits.
- The bot must continue offline using its last valid catalog and must never use stale source-code seeds as an implicit fallback.
- Do not log passwords, tokens, WhatsApp auth, client conversations, or image binaries.

---

## Phase 1: Canonical Catalog and Services

### Task 1: Establish schema and migration dry-run

**Files:** Create `supabase/migrations/<timestamp>_daima_landing_catalog.sql`; Create `scripts/daima-catalog-dry-run.mjs`; Test `test/catalog-migration.test.mjs`.

- [ ] Write failing tests for required tables, unique service keys, non-negative prices, positive durations, immutable revision rows, and appointment price snapshots.
- [ ] Run the focused test and verify failure before schema exists.
- [ ] Add tables `landing_services`, `landing_revisions`, and `landing_audit_log` with indexes, constraints, and RLS that deny public writes.
- [ ] Implement a dry-run importer that reads a read-only copy of live SQLite `precios`, maps `clave → key`, reports duplicates/invalid rows, and emits a deterministic JSON report without writing.
- [ ] Run migration tests and the dry-run against a fixture containing current runtime rows and stale seed differences; require an explicit `--apply` gate for later execution.

### Task 2: Admin service CRUD and publish

**Files:** Create `lib/landing-catalog.js`; Create `api/admin/landing/services.js`; Create `api/admin/landing/publish.js`; Modify `admin.html`; Tests `test/landing-catalog.test.mjs`, `test/admin-landing-api.test.mjs`.

- [ ] Write failing tests for admin-only GET/POST/PUT, validation, expected-version conflicts, audit rows, and publish atomicity.
- [ ] Implement repository functions with Supabase service role kept server-side; return redacted DTOs.
- [ ] Add explicit draft/edit/publish controls to the existing admin panel; do not reuse the product store endpoint for services.
- [ ] Run unit and API tests; verify unauthorized, malformed, stale-version, and rate-limited requests fail closed.

### Task 3: Public service bundle and fallback

**Files:** Create `api/landing-content.js`; Modify `index.html`; Create `lib/landing-fallback.js`; Tests `test/public-landing-content.test.mjs`.

- [ ] Write failing tests for published-only output, hidden services, stable ordering, cache headers, and fallback when Supabase is unavailable.
- [ ] Implement a minimal client adapter that replaces only hardcoded service values and preserves the existing layout.
- [ ] Bundle the last known-good catalog as a versioned fallback artifact; never render an empty pricing section on API failure.
- [ ] Build and smoke-test the public landing against both success and failure fixtures.

### Task 4: Phase 1 migration, deploy, and rollback

- [ ] Back up the live SQLite database and export the dry-run report; stop if any key/value discrepancy is unresolved.
- [ ] Apply the catalog migration through the authorized Supabase channel; verify tables, constraints, and RLS by read-only checks.
- [ ] Import the live runtime catalog, publish the first revision, deploy the frontend, and verify public prices.
- [ ] Record a rollback command that republishes the prior known-good revision; do not modify appointments.

## Phase 2: Text, Hero, and Links

### Task 5: Content/link schema and validation

**Files:** Modify migration; Create `lib/landing-content.js`; Create `api/admin/landing/content.js`; Create `api/admin/landing/links.js`; Tests `test/landing-content.test.mjs`.

- [ ] Write failing tests for required keys, text length limits, HTTPS-only links, allowed `mailto:`/`tel:`, XSS payload rejection, and version conflicts.
- [ ] Add `landing_content` and `landing_links` with revision/audit linkage.
- [ ] Implement admin CRUD and public published projection without exposing drafts or actor metadata.

### Task 6: Admin editor and public integration

**Files:** Modify `admin.html`; Modify `index.html`; Tests `test/landing-browser-contract.test.mjs`.

- [ ] Write failing browser-contract tests for hero, sections, CTA labels, contact links, and fallback behavior.
- [ ] Add focused forms with previews and unsaved-change warnings; keep authentication and existing navigation intact.
- [ ] Replace only eligible hardcoded copy/link nodes with published values.
- [ ] Build, run accessibility checks for labels/focus/errors, deploy, and verify published/fallback paths.

## Phase 3: Gallery, Media, Versioning, and Rollback

### Task 7: Media storage and safe replacement

**Files:** Modify migration; Create `lib/landing-media.js`; Create `api/admin/landing/media.js`; Tests `test/landing-media.test.mjs`.

- [ ] Write failing tests for JPEG/PNG/WebP signature validation, 4 MiB limit, invalid extension, UUID paths, replacement, retention, and no path traversal.
- [ ] Add dedicated Storage bucket/policies and `landing_media` metadata.
- [ ] Upload to a new object, validate/decode/re-encode where supported, create a pending revision, and delete old objects only after publish plus retention.
- [ ] Ensure failed upload/publish leaves the old public image intact.

### Task 8: Import current assets and gallery editor

**Files:** Create `scripts/import-daima-assets.mjs`; Modify `admin.html`; Modify `index.html`; Tests `test/landing-gallery.test.mjs`.

- [ ] Write fixture tests for all current hero/story/gallery assets, alt text, order, and missing-file handling.
- [ ] Import current assets into Supabase Storage without deleting Vercel assets; create metadata mapping preserving current labels and links.
- [ ] Add admin gallery reorder, caption/alt/link edit, visibility, replacement, preview, and rollback actions.
- [ ] Add audit entries containing hashes and metadata only; never store image bytes in audit logs.

### Task 9: Revision history and rollback UI

- [ ] Write failing tests for immutable revisions, atomic publish, rollback creating a new revision, and audit traceability.
- [ ] Add an admin revision list with diff summary, publish, and rollback confirmation.
- [ ] Run frontend build and end-to-end fixture tests; verify no private draft or storage path appears publicly.

## Phase 4: Bot Synchronization and Offline Operation

### Task 10: Versioned catalog sync endpoint

**Files:** Create `api/catalog-sync.js`; Create `lib/catalog-payload.js`; Tests `test/catalog-sync-api.test.mjs`.

- [ ] Write failing tests for server authentication, checksum/version verification, ordering, invalid payload rejection, and rate limits.
- [ ] Implement a minimal server-to-server endpoint returning `{ revision, services, checksum }`; never expose admin credentials.
- [ ] Add replay/stale revision rejection and audit events without price data leakage.

### Task 11: Bot validated cache

**Files:** Modify `/root/daima-whatsapp/src/config.js`; Modify `/root/daima-whatsapp/src/db.js`; Create `/root/daima-whatsapp/src/catalog-sync.js`; Tests `/root/daima-whatsapp/test/catalog-sync.test.mjs`.

- [ ] Write failing tests for valid sync, checksum failure, schema failure, timeout, offline response, and preserving the last good cache.
- [ ] Add SQLite catalog metadata (`source`, `revision`, `checksum`, `synced_at`, `stale_since`) and transactional replacement by stable key.
- [ ] Make `listarPrecios()` read the validated cache; remove implicit source-code fallback after cutover, but keep seed logic only for fresh installations before migration.
- [ ] Add an admin-visible stale indicator and a manual sync diagnostic; do not send WhatsApp messages automatically.

### Task 12: Cutover, observation, and rollback

- [ ] Run the full backend/frontend suites, syntax checks, migration verification, and a bot dry-run using fixtures only.
- [ ] Back up SQLite and current Vercel content; deploy catalog sync first, then restart the Daima bot only through the existing supervisor if required.
- [ ] Verify bot prices equal the published Supabase revision and that disabling the sync endpoint leaves booking/price reads operational from cache.
- [ ] Roll back by restoring the prior bot cache and republishing the prior landing revision; never delete the canonical history.

## Cross-Phase Verification

- [ ] No unauthorized browser or direct API request can mutate content, services, media, or publication.
- [ ] Public failure renders the last known-good bundle, not blank or invented content.
- [ ] Appointments preserve historical service name/price/duration snapshots after catalog edits.
- [ ] Audit records identify actor/action/version/result without passwords, tokens, client chat, or image binaries.
- [ ] Every deployment has a backup, a read-only smoke check, and a documented rollback path.

## Self-Review Findings

- The existing product CMS must remain separate from landing services; merging them would make store products accidentally become booking services.
- Bot source seeds and live SQLite values can differ; the migration explicitly reads the runtime DB and blocks unresolved conflicts.
- Vercel cannot safely write the bot's SQLite directly; synchronization is server-to-server and cache-based.
- Appointment history must snapshot price/duration so later admin edits do not rewrite historical financial data.
- Media replacement cannot be destructive-first; new upload, publish, retention, then deletion is required.
