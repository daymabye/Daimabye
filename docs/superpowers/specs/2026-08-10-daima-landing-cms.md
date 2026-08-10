# Daima Landing CMS Specification

**Date:** 2026-08-10  
**Status:** Approved for planning; implementation not started

## Goal

Make the authenticated Daima admin panel the single operational source for landing content and service prices. Supabase is the canonical store; the public landing consumes published content, while the WhatsApp bot synchronizes a durable local cache and continues operating offline.

## Scope

The CMS covers hero and landing copy, services/prices/durations, links, gallery items, and replacement of the images currently bundled under `assets/`. It includes audit history, reversible replacement, validation, authorization, rate limits, migration, synchronization, deployment, and rollback.

It does not redesign the landing, change booking semantics, expose private client references, migrate WhatsApp auth, or edit FivIA.

## Current System Constraints

- The landing is static HTML on Vercel (`/root/daima-web/index.html`) with hardcoded copy, prices, links, and gallery references.
- Admin authentication already uses `/api/admin/login`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, and an HttpOnly/Secure signed cookie.
- Product CRUD already uses Supabase table `productos` and public bucket `productos-fotos`; this is separate from the landing CMS.
- The bot uses `/root/daima-whatsapp/data/daima.db`, where `precios` is currently edited from WhatsApp/admin.
- Existing bot SQLite data is authoritative for migration input only. After cutover, Supabase is authoritative and SQLite is a cache.

## Canonical Data Model

Use a private schema with public-read API projection. Every mutable record has `id uuid`, `created_at`, `updated_at`, `updated_by`, `version bigint`, `status`, and `deleted_at` where applicable.

### `landing_services`

`key` unique, `name`, `description`, `price numeric(10,2)`, `duration_minutes integer`, `display_order integer`, `visible boolean`, `published_version uuid`.

The service `key` is stable and is the synchronization identity. Price must be non-negative, duration must be positive, and names/descriptions are length-limited. Public output includes only published visible rows.

### `landing_content`

`key` unique, `section`, `value`, `format` (`text|url|json`), `visible`, `published_version`. Text values are length-limited; URLs allow only HTTPS or explicitly approved local paths.

### `landing_media`

`key` unique, `section`, `storage_path`, `public_url`, `alt_text`, `caption`, `display_order`, `visible`, `published_version`, `replaced_by`. Media is stored in a dedicated Supabase Storage bucket, never in the database as binary data.

### `landing_links`

`key` unique, `label`, `url`, `section`, `display_order`, `visible`, `published_version`. Allowed schemes are HTTPS and approved `mailto:`/`tel:` forms; JavaScript/data URLs are rejected.

### Versioning and audit

`landing_revisions` stores immutable snapshots with `revision_id`, `entity_type`, `entity_id`, `payload jsonb`, `version`, `created_by`, `created_at`, `reason`, and `state` (`draft|published|superseded|rolled_back`). `landing_audit_log` records actor, action, entity, before/after hashes, request id, IP metadata truncated to operational need, and result. No passwords, auth tokens, client chat, or image binary is logged.

## Publication and Rollback

Writes create a new revision and use optimistic concurrency (`expected_version`). Publication is explicit and atomic per content bundle. The public endpoint reads only the latest published bundle. Rollback creates a new published revision pointing to a prior snapshot; it never deletes history. Replacing media uploads a new UUID path, verifies it, updates the revision, and deletes the old object only after the new revision is published and retention permits.

## SQLite Migration and Bot Synchronization

The migration imports the live SQLite `precios` rows by stable `clave`, preserving name, price, duration, and order. It must produce a dry-run report, flag duplicate keys/invalid values, and require an explicit cutover acknowledgment. Existing SQLite rows are backed up before cutover.

After cutover:

1. The admin panel writes Supabase only.
2. The bot polls a versioned catalog endpoint using a server-to-server credential, validates the signed/hashed payload, and transactionally replaces its local cache.
3. Until a valid catalog is received, the bot uses its last known cache and reports stale status to admin; it never silently falls back to source-code seed values.
4. Offline operation remains available for booking and price responses using the last valid cache.
5. Conflicts are rejected and audited; there is no last-writer-wins merge for prices.

## Security and Privacy

- All mutation endpoints require the existing admin session and CSRF protection for browser writes.
- Server-side service-role credentials never reach the browser.
- Rate-limit login, mutations, uploads, publication, and bot sync separately.
- Validate MIME by signature as well as extension; allow JPEG, PNG, and WebP only; default maximum 4 MiB; decode/re-encode to remove active payloads and metadata where practical.
- Use UUID object paths, no user-controlled path traversal, and a dedicated bucket policy.
- Public API returns published public fields only. Drafts, audit records, storage paths, actor identity, and revision internals remain admin-only.
- Admin actions are auditable; image alt text must not contain personal client data.

## Public API Contract

- `GET /api/landing-content` → `{ revision, content, services, links, media }`, published only, cache-safe and versioned.
- Authenticated admin CRUD endpoints for drafts and revisions.
- `POST /api/admin/landing/publish` with `expected_revision`.
- `POST /api/admin/landing/rollback` with a prior revision id.
- `POST /api/admin/landing/media` returns a pending media id only after validation.
- Bot endpoint returns catalog `{ revision, services, checksum }` and requires server authentication.

## Failure Behavior

If the public CMS endpoint fails, the landing uses the last bundled known-good content and clearly records the stale revision in diagnostics; it must not render blank pricing. If bot sync fails, the bot uses its last valid SQLite cache and alerts the admin without changing prices.

## Acceptance Criteria

1. A logged-in admin can edit and publish all scoped content without editing HTML or SSH.
2. Public visitors see only published content and a known-good fallback during API failure.
3. Current images can be imported, replaced, previewed, and rolled back without broken references.
4. Supabase is the sole price authority after cutover; the bot uses a validated offline cache.
5. Every mutation/publication/rollback/sync decision is auditable without private content leakage.
6. Invalid, unauthorized, oversized, stale-version, or rate-limited requests fail closed.

## Risks and Resolutions

- **Runtime/catalog drift:** import from the live DB, not stale seed constants; block cutover on unresolved differences.
- **Static-to-dynamic outage:** retain a bundled published fallback and no-store/versioned API responses.
- **Vercel-to-VPS coupling:** use Supabase for public content and a separate authenticated bot sync; never make Vercel depend on the VPS for landing reads.
- **Media deletion:** reversible UUID replacement and retention window prevent accidental loss.
- **Price edits affecting bookings:** catalog revisions are immutable; appointments retain their booked price and service snapshot.
