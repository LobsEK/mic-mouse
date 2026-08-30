-- Mic Mouse — kompletná schéma. Spusti raz v Supabase → SQL Editor.
create extension if not exists "pgcrypto";

create table contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, company text, role text, email text, phone text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  title text not null, value numeric not null default 0,
  stage text not null default 'Qualified'
    check (stage in ('Qualified','Proposal','Negotiation','Won','Lost')),
  close_date date, note text,
  created_at timestamptz not null default now()
);

create table agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('sales','ads','marketing','support')),
  status text not null default 'active' check (status in ('active','paused')),
  config jsonb not null default '{}',
  goal text,
  autopilot boolean not null default false,
  required_tools text[] not null default '{}',
  health text not null default 'idle' check (health in ('idle','working','blocked','error')),
  current_activity text, last_run_at timestamptz, last_error text, last_error_hint text,
  token_budget integer not null default 300000,
  tokens_used integer not null default 0,
  cost_eur numeric not null default 0,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  title text not null,
  state text not null default 'me' check (state in ('ai','me','done')),
  due date,
  created_at timestamptz not null default now()
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  title text, kind text not null default 'task',
  input jsonb not null default '{}', output text, model text,
  status text not null default 'pending'
    check (status in ('pending','running','needs_approval','approved','rejected','failed','blocked','done')),
  error text, blocked_reason text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_eur numeric not null default 0,
  autopilot_depth integer not null default 0,
  parent_proposal_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz, finished_at timestamptz
);

create table run_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references agent_runs(id) on delete cascade,
  step_no integer not null default 1,
  label text not null,
  status text not null default 'running' check (status in ('running','done','failed','blocked')),
  detail text,
  created_at timestamptz not null default now()
);
create index run_steps_run_idx on run_steps(run_id, step_no);

create table task_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  parent_run_id uuid references agent_runs(id) on delete set null,
  title text not null, rationale text, expected_outcome text,
  est_tokens integer not null default 0,
  est_cost_eur numeric not null default 0,
  impact integer not null default 3 check (impact between 1 and 5),
  effort integer not null default 3 check (effort between 1 and 5),
  verdict text not null default 'borderline' check (verdict in ('worth','borderline','not_worth')),
  verdict_reason text,
  requires_tools text[] not null default '{}',
  status text not null default 'proposed'
    check (status in ('proposed','accepted','dismissed','executed','blocked')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index task_proposals_open_idx on task_proposals(owner_id, status);

create table agent_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references agents(id) on delete cascade,
  run_id uuid references agent_runs(id) on delete set null,
  level text not null default 'info' check (level in ('info','warn','error')),
  message text not null, hint text,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index agent_events_unseen_idx on agent_events(owner_id, seen_at);

create table connectors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  key text not null, label text not null,
  status text not null default 'not_connected'
    check (status in ('connected','not_connected','error','unavailable')),
  detail text, config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (owner_id, key)
);

create table briefings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  content text not null, stats jsonb not null default '{}',
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create table settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null default 'Instaview',
  sender_name text,
  tone text not null default 'friendly, concise, professional',
  updated_at timestamptz not null default now()
);

-- Každý vidí len svoje dáta.
do $$
declare t text;
begin
  for t in select unnest(array['contacts','deals','agents','tasks','agent_runs','run_steps',
                              'task_proposals','agent_events','connectors','briefings','settings'])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "owner_all" on %I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;
