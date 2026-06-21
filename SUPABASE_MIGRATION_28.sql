-- =====================================================================
-- MIGRATION 28 : rachat des points de fidélité
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- Points effectifs = points gagnés (total achats / seuil) − points rachetés.
-- =====================================================================
create table if not exists fidelite_rachats (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  client text not null,
  points integer not null default 0,
  valeur integer not null default 0,
  auteur text,
  created_at timestamptz default now()
);
alter table fidelite_rachats enable row level security;
drop policy if exists "fidrachat_membre" on fidelite_rachats;
create policy "fidrachat_membre" on fidelite_rachats for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
