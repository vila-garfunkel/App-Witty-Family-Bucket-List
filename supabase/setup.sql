-- Run once in the connected project's SQL Editor before deploying the function.
-- Safe to rerun: existing users and bucket data are not removed.
create table if not exists public.kv_store_a728503c (
  key text primary key not null,
  value jsonb not null
);

alter table public.kv_store_a728503c enable row level security;

-- Browsers must use the authenticated Edge Function, never the table directly.
revoke all on table public.kv_store_a728503c from public, anon, authenticated;
grant select, insert, update, delete on table public.kv_store_a728503c to service_role;

notify pgrst, 'reload schema';
