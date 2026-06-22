-- =====================================================================
-- MIGRATION 31 : journal des erreurs (monitoring des bugs du terrain)
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- Consultable dans Supabase (table erreurs) — lecture réservée à l'admin.
-- =====================================================================
create table if not exists erreurs (
  id bigint generated always as identity primary key,
  message text, stack text, url text, user_email text,
  created_at timestamptz default now()
);
alter table erreurs enable row level security;
drop policy if exists "erreurs_insert" on erreurs;
create policy "erreurs_insert" on erreurs for insert to authenticated with check (true);
drop policy if exists "erreurs_admin" on erreurs;
create policy "erreurs_admin" on erreurs for select
  using (lower(auth.jwt() ->> 'email') = 'flahba@icloud.com');
