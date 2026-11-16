-- Background jobs (so slow work never hits a host's request time limit),
-- learning from review feedback, and AI photo touch-ups.

-- ---------- Jobs ----------
create type job_status as enum ('queued', 'running', 'done', 'failed');

create table jobs (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                 -- generate | rerender | publish | extend_photo | learn
  payload     jsonb not null default '{}'::jsonb,
  status      job_status not null default 'queued',
  result      jsonb,
  error       text,
  actor       text,
  attempts    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on jobs (status, created_at);
alter table jobs enable row level security;

-- Atomically claim a queued job (two workers can never run the same job).
create or replace function claim_job(job_id uuid) returns setof jobs
language sql
set search_path = public
as $$
  update jobs set status = 'running', attempts = attempts + 1, updated_at = now()
  where id = job_id and status = 'queued'
  returning *;
$$;
-- Only the server (secret key) may claim jobs.
revoke execute on function claim_job(uuid) from public, anon, authenticated;
grant execute on function claim_job(uuid) to service_role;

-- ---------- Learning ----------
-- What Claude produced, kept untouched so edits can be compared with it.
alter table creatives add column original jsonb;

create type feedback_kind as enum ('approved_unchanged', 'approved_edited', 'rejected');

create table feedback (
  id           bigint generated always as identity primary key,
  brand_id     text not null references brands(id),
  item_id      uuid references calendar_items(id) on delete set null,
  creative_id  uuid references creatives(id) on delete set null,
  kind         feedback_kind not null,
  placement    text,
  pillar       text,
  original     jsonb,                        -- Claude's version {slides overlays, copy}
  final        jsonb,                        -- what was approved
  reason       text,                         -- why it was rejected
  created_at   timestamptz not null default now()
);
create index on feedback (brand_id, created_at desc);
alter table feedback enable row level security;

create type suggestion_status as enum ('pending', 'accepted', 'dismissed');

create table rule_suggestions (
  id          bigint generated always as identity primary key,
  brand_id    text not null references brands(id),
  rule        text not null,
  evidence    text,
  status      suggestion_status not null default 'pending',
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
alter table rule_suggestions enable row level security;

-- ---------- Photo touch-ups ----------
-- A 9:16 version of a landscape photo with AI-extended top/bottom. Used only
-- for story-shaped renders; the original stays the source for everything else.
alter table photos add column story_variant_path text;
alter table photos add column story_variant_ai boolean not null default false;
