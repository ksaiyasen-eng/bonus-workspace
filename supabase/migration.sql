-- Bonus Workspace shared data, in the vari-trucks project. Prefix bonus_ keeps it apart from the other apps' tables.
-- Row level security is on with no policies: the anon and authenticated keys can read nothing; only the edge function can.

create table public.bonus_state (
  id text primary key,
  data jsonb not null,
  version integer not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
create table public.bonus_history (
  day date primary key,
  data jsonb not null,
  version integer not null,
  saved_at timestamptz not null default now()
);
create table public.bonus_pins (
  role text primary key check (role in ('manager', 'staff')),
  hash text not null,
  updated_at timestamptz not null default now()
);
create table public.bonus_fails (
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index bonus_fails_ip_at on public.bonus_fails (ip, at);

alter table public.bonus_state enable row level security;
alter table public.bonus_history enable row level security;
alter table public.bonus_pins enable row level security;
alter table public.bonus_fails enable row level security;
