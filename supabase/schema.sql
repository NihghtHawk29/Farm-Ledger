-- ============================================================================
-- FarmLedger — Supabase schema
-- Run this once in your project: Supabase Dashboard → SQL Editor → New query →
-- paste this whole file → Run.
--
-- Design notes:
--  * One table per entity, matching the app's in-memory shapes.
--  * Column names are quoted camelCase so they match the JavaScript object keys
--    exactly (workType, wageRate, receivedBy, ...). This lets the app read/write
--    rows with no field renaming.
--  * Every table is scoped to the signed-in user via `user_id`, which defaults
--    to auth.uid(). Row Level Security ensures each user only ever sees/edits
--    their own rows — the client never has to send user_id.
-- ============================================================================

-- ---------- WAGES ----------
create table if not exists public.wages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  "date"       text,
  "name"       text,
  "workers"    numeric,
  "plot"       text,
  "workType"   text,
  "wageRate"   numeric,
  "amount"     numeric,
  "paymentMode" text,
  "status"     text,
  "receivedBy" text
);

-- ---------- EXPENSES ----------
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  "date"        text,
  "description" text,
  "category"    text,
  "amount"      numeric,
  "paymentMode" text,
  "paidTo"      text,
  "sheet"       text not null default 'Farm'  -- 'Farm' or 'Home'
);

-- ---------- HARVEST ----------
create table if not exists public.harvest (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  "round"                   numeric,
  "date"                    text,
  "plot"                    text,
  "wetWeightWithCart_kg"    numeric,
  "cartWeight_kg"           numeric,
  "netWetWeight_kg"         numeric,
  "netWetQuintals"          numeric,
  "marketRatePerQuintalDry" numeric,
  "amount"                  numeric
);

-- ---------- PAYMENTS ----------
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  "date"   text,
  "amount" numeric,
  "note"   text
);

-- ---------- TREE LOSS ----------
create table if not exists public.tree_loss (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  "date"      text,
  "plot"      text,
  "treesLost" numeric,
  "cause"     text,
  "notes"     text
);

-- ---------- WATERING ----------
create table if not exists public.watering (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  "date"   text,
  "plot"   text,
  "method" text,
  "notes"  text
);

-- ---------- PESTS ----------
create table if not exists public.pests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  "date"          text,
  "plot"          text,
  "type"          text,
  "severity"      text,
  "treesAffected" text,
  "actionTaken"   text,
  "notes"         text
);

-- ---------- SOIL / WATER TESTS ----------
create table if not exists public.soil_tests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  "date"           text,
  "plot"           text,
  "sampleType"     text,
  "pH"             text,
  "ecOrOther"      text,
  "labName"        text,
  "recommendation" text
);

-- ---------- SETTINGS (per-user key/value, e.g. Agmarknet API key) ----------
create table if not exists public.settings (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,
  value      text,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- ============================================================================
-- Row Level Security — each user only touches their own rows.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'wages','expenses','harvest','payments',
    'tree_loss','watering','pests','soil_tests','settings'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format($f$
      drop policy if exists "own rows select" on public.%1$I;
      create policy "own rows select" on public.%1$I
        for select using (auth.uid() = user_id);
    $f$, t);

    execute format($f$
      drop policy if exists "own rows insert" on public.%1$I;
      create policy "own rows insert" on public.%1$I
        for insert with check (auth.uid() = user_id);
    $f$, t);

    execute format($f$
      drop policy if exists "own rows update" on public.%1$I;
      create policy "own rows update" on public.%1$I
        for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, t);

    execute format($f$
      drop policy if exists "own rows delete" on public.%1$I;
      create policy "own rows delete" on public.%1$I
        for delete using (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;
