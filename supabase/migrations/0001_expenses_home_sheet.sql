-- Adds the Farm/Home split to the expenses ledger.
-- Run once in Supabase → SQL Editor if you already created the expenses table
-- before this feature existed. New projects get this column from schema.sql.
--
-- Existing rows are backfilled to 'Farm' (they were all farm expenses).

alter table public.expenses
  add column if not exists "sheet" text not null default 'Farm';
