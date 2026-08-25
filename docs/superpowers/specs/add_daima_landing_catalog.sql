create table if not exists public.landing_services (
  key text primary key,
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 500),
  price numeric(10,2) not null check (price >= 0),
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes <= 1440),
  display_order integer not null default 0,
  visible boolean not null default true,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.landing_catalog_revisions (
  id uuid primary key default gen_random_uuid(),
  revision bigint generated always as identity unique,
  snapshot jsonb not null,
  state text not null check (state in ('published','superseded','rolled_back')),
  created_at timestamptz not null default now(),
  created_by text not null
);

alter table public.landing_services enable row level security;
alter table public.landing_catalog_revisions enable row level security;
drop policy if exists landing_services_public_read on public.landing_services;
create policy landing_services_public_read on public.landing_services for select using (visible = true);
revoke insert, update, delete on public.landing_services from anon, authenticated;
revoke all on public.landing_catalog_revisions from anon, authenticated;
create index if not exists landing_services_order_idx on public.landing_services (display_order, key);
