-- Mic Mouse — agent engine
-- Run AFTER 0001_init.sql, in Supabase Dashboard -> SQL Editor.
-- Adds: live agent health, connectors, per-step run progress, token/cost ledger,
-- 2-steps-ahead proposals with a cost/benefit verdict, agent events (errors + how to fix),
-- and Apollo briefings.

-- ---------- AGENTS: health, autopilot, budget, required tools ----------
alter table agents add column if not exists autopilot boolean not null default false;
alter table agents add column if not exists required_tools text[] not null default '{}';
alter table agents add column if not exists goal text;
alter table agents add column if not exists health text not null default 'idle'
  check (health in ('idle','working','blocked','error'));
alter table agents add column if not exists last_run_at timestamptz;
alter table agents add column if not exists last_error text;
alter table agents add column if not exists last_error_hint text;
alter table agents add column if not exists current_activity text;
alter table agents add column if not exists token_budget integer not null default 300000;
alter table agents add column if not exists tokens_used integer not null default 0;
alter table agents add column if not exists cost_eur numeric not null default 0;

-- ---------- AGENT RUNS: what step this was, what it cost ----------
alter table agent_runs add column if not exists title text;
alter table agent_runs add column if not exists kind text not null default 'task';
alter table agent_runs add column if not exists input_tokens integer not null default 0;
alter table agent_runs add column if not exists output_tokens integer not null default 0;
alter table agent_runs add column if not exists cost_eur numeric not null default 0;
alter table agent_runs add column if not exists autopilot_depth integer not null default 0;
alter table agent_runs add column if not exists parent_proposal_id uuid;
alter table agent_runs add column if not exists blocked_reason text;
alter table agent_runs add column if not exists finished_at timestamptz;

-- the run status list grows: 'running' and 'blocked' are new
alter table agent_runs drop constraint if exists agent_runs_status_check;
alter table agent_runs add constraint agent_runs_status_check
  check (status in ('pending','running','needs_approval','approved','rejected','failed','blocked','done'));

-- ---------- CONNECTORS: what the agent may actually reach ----------
create table if not exists connectors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  label text not null,
  status text not null default 'not_connected'
    check (status in ('connected','not_connected','error','unavailable')),
  detail text,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (owner_id, key)
);

-- ---------- RUN STEPS: the live "what is it doing right now" timeline ----------
create table if not exists run_steps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references agent_runs(id) on delete cascade,
  step_no integer not null default 1,
  label text not null,
  status text not null default 'running'
    check (status in ('running','done','failed','blocked')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists run_steps_run_idx on run_steps(run_id, step_no);

-- ---------- TASK PROPOSALS: every run ends with 2 natural next steps ----------
create table if not exists task_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  parent_run_id uuid references agent_runs(id) on delete set null,
  title text not null,
  rationale text,
  expected_outcome text,
  est_tokens integer not null default 0,
  est_cost_eur numeric not null default 0,
  impact integer not null default 3 check (impact between 1 and 5),
  effort integer not null default 3 check (effort between 1 and 5),
  verdict text not null default 'borderline'
    check (verdict in ('worth','borderline','not_worth')),
  verdict_reason text,
  requires_tools text[] not null default '{}',
  status text not null default 'proposed'
    check (status in ('proposed','accepted','dismissed','executed','blocked')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists task_proposals_open_idx on task_proposals(owner_id, status);

-- ---------- AGENT EVENTS: errors Apollo reports, with how to fix them ----------
create table if not exists agent_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  agent_id uuid references agents(id) on delete cascade,
  run_id uuid references agent_runs(id) on delete set null,
  level text not null default 'info' check (level in ('info','warn','error')),
  message text not null,
  hint text,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists agent_events_unseen_idx on agent_events(owner_id, seen_at);

-- ---------- BRIEFINGS: what Apollo says when you come back ----------
create table if not exists briefings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  stats jsonb not null default '{}',
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

-- ================= ROW LEVEL SECURITY =================
alter table connectors enable row level security;
alter table run_steps enable row level security;
alter table task_proposals enable row level security;
alter table agent_events enable row level security;
alter table briefings enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['connectors','run_steps','task_proposals','agent_events','briefings'])
  loop
    execute format('drop policy if exists "owner_all" on %I', t);
    execute format(
      'create policy "owner_all" on %I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

-- ================= DEFAULT CONNECTOR ROWS =================
-- Seeds the honest capability list for a user: what the agents can reach today,
-- and what is not wired up yet (so an agent that needs it reports "blocked", not fake success).
create or replace function seed_connectors(uid uuid)
returns void language plpgsql security definer as $$
begin
  insert into connectors (owner_id, key, label, status, detail) values
    (uid, 'crm',      'Interné CRM (kontakty, obchody, úlohy)', 'connected',
       'Vstavané. Agent číta aj zapisuje priamo do tvojej databázy.'),
    (uid, 'web',      'Web research (vyhľadávanie na internete)', 'connected',
       'Vstavané cez Claude web search. Agent si vie naozaj dohľadať informácie o firme alebo kontakte.'),
    (uid, 'email',    'Odosielanie e-mailov (SMTP / Gmail)', 'not_connected',
       'Zatiaľ nenapojené. Agent vie e-mail napísať a pripraviť na schválenie, ale odoslať ho musíš ty.'),
    (uid, 'linkedin', 'LinkedIn', 'not_connected',
       'Zatiaľ nenapojené. Potrebný oficiálny prístup alebo nástroj tretej strany.'),
    (uid, 'x',        'X / Twitter', 'not_connected',
       'Zatiaľ nenapojené. Vyžaduje X API účet s platenym prístupom na zápis.'),
    (uid, 'ads',      'Reklamné platformy (Meta / Google / LinkedIn Ads)', 'not_connected',
       'Zatiaľ nenapojené. Agent vie kampaň naplánovať a napísať, spustiť ju musíš ty.'),
    (uid, 'analytics','Analytika (GA4)', 'not_connected',
       'Zatiaľ nenapojené. Bez nej agent nevie merať reálne dosahy kampaní.')
  on conflict (owner_id, key) do nothing;
end $$;
