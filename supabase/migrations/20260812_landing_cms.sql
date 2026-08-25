-- Landing CMS singleton (texts, photos, typography). Separate from productos and landing_services.
create table if not exists public.landing_cms (
  id text primary key default 'default',
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.landing_cms (id, content)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.landing_cms enable row level security;
-- Service role bypasses RLS; no public policies needed for writes.
