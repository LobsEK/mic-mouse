-- Mic Mouse — initial schema
-- Run this once in Supabase Dashboard → SQL Editor (or via `supabase db push`).
-- Every table is scoped to the logged-in user via Row Level Security (owner_id = auth.uid()),
-- so this is already safe to open up to more users later — each person only ever sees their own rows.

create extension if not exists "pgcrypto";

-- ---------- CONTACTS ----------
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  company text,
  role text,
  email text,
  phone text,
  tags text[] default '{}',
  created_at timestamptz not null default now()
);

-- ---------- DEALS ----------
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  title text not null,
  value numeric default 0,
  stage text not null default 'Qualified' check (stage in ('Qualified','Proposal','Negotiation','Won','Lost')),
  close_date date,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- AGENTS ----------
create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('sales','ads','marketing','support')),
  status text not null default 'active' check (status in ('active','paused')),
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------- TASKS (work items created by agents or by the user) ----------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  title text not null,
  state text not null default 'me' check (state in ('ai','me','done')),
  due date,
  created_at timestamptz not null default now()
);

-- ---------- AGENT RUNS (every real Claude call an agent makes, + approval workflow) ----------
create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  input jsonb not null default '{}',
  output text,
  model text,
  status text not null default 'pending' check (status in ('pending','needs_approval','approved','rejected','failed')),
  error text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ---------- SETTINGS (per-user agent config, e.g. tone / signature) ----------
create table if not exists settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  company_name text default 'Instaview',
  sender_name text,
  tone text default 'friendly, concise, professional',
  updated_at timestamptz not null default now()
);

-- ================= ROW LEVEL SECURITY =================
alter table contacts enable row level security;
alter table deals enable row level security;
alter table agents enable row level security;
alter table tasks enable row level security;
alter table agent_runs enable row level security;
alter table settings enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array['contacts','deals','agents','tasks','agent_runs','settings'])
  loop
    execute format('drop policy if exists "owner_all" on %I', t);
    execute format(
      'create policy "owner_all" on %I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- ================= SEED HELPER =================
-- After you log in for the first time, run this once (replace the email) to get starter data:
-- select seed_demo_data('you@instaview.sk');
create or replace function seed_demo_data(user_email text)
returns void
language plpgsql
security definer
as $$
declare
  uid uuid;
  c1 uuid;
  a1 uuid;
begin
  select id into uid from auth.users where email = user_email;
  if uid is null then
    raise exception 'No user with email %', user_email;
  end if;

  insert into settings (owner_id, company_name, sender_name)
  values (uid, 'Instaview', split_part(user_email, '@', 1))
  on conflict (owner_id) do nothing;

  insert into contacts (owner_id, name, company, role, email, phone, tags)
  values (uid, 'Martina Kovac', 'Nordwell', 'Head of Ops', 'm.kovac@nordwell.io', '+421 903 118 220', array['warm'])
  returning id into c1;

  insert into agents (owner_id, name, kind, status)
  values (uid, 'Sales agent', 'sales', 'active')
  returning id into a1;

  insert into deals (owner_id, contact_id, title, value, stage, close_date, note)
  values (uid, c1, 'Nordwell — automation pilot', 14500, 'Proposal', current_date + 14, 'Waiting on legal review.');

  insert into tasks (owner_id, agent_id, title, state, due)
  values (uid, a1, 'Draft follow-up sequence for Nordwell', 'ai', current_date);
end;
$$;
