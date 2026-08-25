-- Daima agenda repair: persistent recovery/idempotency key + import audit.
-- Safe to re-run. Does NOT delete or rewrite existing appointment rows.

create extension if not exists pgcrypto;

create table if not exists public.citas (
  id uuid primary key default gen_random_uuid(),
  creada_en timestamptz not null default now(),
  nombre text,
  correo text,
  telefono text,
  instagram text,
  plan text,
  fecha text,
  hora text,
  fecha_iso date,
  hora24 text,
  duracion_min integer,
  sector text,
  estado text not null default 'en_proceso',
  historial jsonb not null default '[]'::jsonb,
  notas text,
  origen text,
  dispositivo text,
  navegador text,
  llego_desde text,
  correo_enviado boolean,
  correo_motivo text
);

alter table public.citas add column if not exists recovery_key text;
alter table public.citas add column if not exists source_system text;
alter table public.citas add column if not exists source_local_id text;
alter table public.citas add column if not exists import_batch_id uuid;
alter table public.citas add column if not exists review_status text;
alter table public.citas add column if not exists review_reason text;
alter table public.citas add column if not exists updated_at timestamptz not null default now();

-- Persistent unique identity for idempotent import/recovery.
-- Intentionally NOT (fecha, hora, telefono): valid repeats and missing phones must work.
create unique index if not exists citas_recovery_key_uidx
  on public.citas (recovery_key)
  where recovery_key is not null;

create index if not exists citas_fecha_iso_hora24_idx
  on public.citas (fecha_iso, hora24);

create index if not exists citas_review_status_idx
  on public.citas (review_status)
  where review_status is not null;

create table if not exists public.citas_import_audit (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  recovery_key text not null,
  source_system text not null,
  source_local_id text,
  action text not null check (action in ('inserted','skipped_existing','marked_review','snapshot','error')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists citas_import_audit_batch_idx
  on public.citas_import_audit (batch_id, created_at desc);

create table if not exists public.agenda_health (
  id text primary key default 'default',
  remote_count integer,
  local_backup_count integer,
  last_reconcile_at timestamptz,
  last_fail_closed_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.citas enable row level security;
alter table public.citas_import_audit enable row level security;
alter table public.agenda_health enable row level security;

-- Public/anon must never read personal appointment rows.
revoke all on public.citas from anon, authenticated;
revoke all on public.citas_import_audit from anon, authenticated;
revoke all on public.agenda_health from anon, authenticated;

-- Service role (used by Vercel functions) bypasses RLS.
