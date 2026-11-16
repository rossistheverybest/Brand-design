-- Inspiration board: screenshots you like, posts from watched Instagram
-- accounts, weekly "what's working" reports, and requests for new templates.

create table inspirations (
  id           uuid primary key default gen_random_uuid(),
  brand_id     text references brands(id),        -- null = applies to all businesses
  source       text not null check (source in ('upload', 'instagram')),
  image_path   text,                              -- bucket 'media' (copied; IG URLs expire)
  permalink    text unique,                       -- instagram post url (dedupe)
  account      text,                              -- @username for instagram posts
  caption      text,
  note         text,                              -- what you like about it
  engagement   jsonb,                             -- {likes, comments, followers, rate, score}
  posted_at    timestamptz,
  analysis     jsonb,                             -- Claude: traits, rule ideas, template idea
  status       text not null default 'new' check (status in ('new', 'kept', 'archived')),
  created_by   text,
  created_at   timestamptz not null default now()
);
create index on inspirations (brand_id, created_at desc);

create table watch_accounts (
  id           bigint generated always as identity primary key,
  brand_id     text not null references brands(id),
  username     text not null,
  followers    int,
  last_synced  timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  unique (brand_id, username)
);

create table trend_reports (
  id           bigint generated always as identity primary key,
  brand_id     text not null references brands(id),
  summary      text not null,
  findings     jsonb,                             -- [{finding, evidence}]
  template_ideas jsonb,                           -- [{title, description}]
  post_ids     uuid[],                            -- inspirations it looked at
  created_at   timestamptz not null default now()
);

create table template_requests (
  id              bigint generated always as identity primary key,
  brand_id        text references brands(id),
  title           text not null,
  description     text not null,
  inspiration_ids uuid[] not null default '{}',
  status          text not null default 'open' check (status in ('open', 'built', 'declined')),
  created_by      text,
  created_at      timestamptz not null default now()
);

alter table inspirations      enable row level security;
alter table watch_accounts    enable row level security;
alter table trend_reports     enable row level security;
alter table template_requests enable row level security;
