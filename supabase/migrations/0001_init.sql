-- Brand Studio schema.
-- All access goes through the Next.js server with the secret key after an
-- email allowlist check, so RLS is enabled with no policies: the publishable
-- key alone can read or write nothing.

create extension if not exists pgcrypto;

-- One row per brand. `kit` holds colours, fonts, logo paths, voice and rules
-- (shape: src/lib/brand.ts BrandKit). `meta` holds the Page / IG / ad account ids.
create table brands (
  id          text primary key,              -- 'altus', 'corvus', 'winterstoke'
  name        text not null,
  kit         jsonb not null default '{}'::jsonb,
  meta        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create type item_kind   as enum ('post', 'story', 'ad', 'event', 'email', 'film');
create type item_format as enum ('single', 'carousel', 'story', 'reel', 'none');
create type item_status as enum (
  'planned',     -- on the calendar, nothing made yet
  'generated',   -- creatives exist, waiting for review
  'approved',    -- approved; will publish at publish_at (or on demand)
  'published',
  'cancelled'
);

create table calendar_items (
  id           uuid primary key default gen_random_uuid(),
  brand_id     text not null references brands(id),
  date         date not null,
  publish_at   timestamptz,                  -- exact time; null = date at brand default time
  kind         item_kind not null default 'post',
  format       item_format not null default 'single',
  pillar       text,                         -- 'Trip Feature', 'Skills Tip', 'Inspiration' ...
  title        text not null,
  brief        text,                         -- key message, offer, dates, prices, link
  link_url     text,                         -- landing page for ads / link stickers
  channels     text[] not null default '{instagram,facebook}',
  -- Paid: when set, "Create ad" puts a PAUSED ad into this ad set.
  ad_set_id    text,
  flag         text,                         -- "needs something" note shown on the calendar
  review_notes text[] not null default '{}', -- what Claude says the approver must check
  status       item_status not null default 'planned',
  source       text,                         -- 'artifact-import', 'manual'
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on calendar_items (date);
create index on calendar_items (brand_id, date);

-- Calendar week themes (campaign goal for the week).
create table week_themes (
  week_start  date not null,
  brand_id    text not null references brands(id),
  theme       text not null,
  goal        text,
  primary key (week_start, brand_id)
);

create table photos (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid references calendar_items(id) on delete set null,
  brand_id      text references brands(id),
  storage_path  text not null,               -- bucket 'media'
  width         int,
  height        int,
  credit        text,                        -- photographer handle, appended to captions
  analysis      jsonb,                       -- Claude photo check (subject, focal point, warnings)
  created_at    timestamptz not null default now()
);
create index on photos (item_id);

create type creative_status as enum ('draft', 'approved', 'rejected', 'published', 'failed');

-- A creative is one deliverable for a placement: a feed post (1..n slides),
-- a story frame, or an ad creative (feed + story images).
create table creatives (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references calendar_items(id) on delete cascade,
  placement     text not null,               -- 'feed' | 'story' | 'ad'
  variant       int not null default 1,
  layout        text not null,               -- template id, see src/lib/render/templates.tsx
  slides        jsonb not null,              -- [{photo_id, overlay:{eyebrow,headline,body,cta}, image_path, aspect}]
  copy          jsonb not null,              -- caption / ad fields
  status        creative_status not null default 'draft',
  meta_result   jsonb,                       -- ids returned by Meta, or the error
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on creatives (item_id);

create table activity (
  id          bigint generated always as identity primary key,
  item_id     uuid references calendar_items(id) on delete cascade,
  creative_id uuid references creatives(id) on delete cascade,
  actor       text,
  action      text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

alter table brands          enable row level security;
alter table calendar_items  enable row level security;
alter table week_themes     enable row level security;
alter table photos          enable row level security;
alter table creatives       enable row level security;
alter table activity        enable row level security;

-- Private bucket for uploads, renders and brand assets. Meta fetches images
-- through short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;
