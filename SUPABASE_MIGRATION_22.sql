-- =====================================================================
-- MIGRATION 22 : audit des modifications/suppressions de mouvements
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- =====================================================================
create table if not exists logs_modifications (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  proprietaire_id uuid references auth.users(id) on delete cascade,
  table_cible text not null,          -- 'historique' | 'produits' | 'transferts'
  cible_id text,                       -- id de la ligne modifiée
  action text not null,                -- 'modification' | 'suppression'
  ancienne_valeur jsonb,
  nouvelle_valeur jsonb,
  user_nom text,
  created_at timestamptz default now()
);
alter table logs_modifications enable row level security;

drop policy if exists "logsmod_insert" on logs_modifications;
create policy "logsmod_insert" on logs_modifications for insert
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

drop policy if exists "logsmod_select_owner" on logs_modifications;
create policy "logsmod_select_owner" on logs_modifications for select
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid()));
