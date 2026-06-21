-- =====================================================================
-- MIGRATION 30 : clients ajoutés manuellement (carnet d'adresses)
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- =====================================================================
create table if not exists clients (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  nom text not null,
  phone text,
  created_at timestamptz default now()
);
alter table clients enable row level security;
drop policy if exists "clients_membre" on clients;
create policy "clients_membre" on clients for all
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()))
  with check (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()));
