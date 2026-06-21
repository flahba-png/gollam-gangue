-- =====================================================================
-- MIGRATION 27 : fil de suivi client (notes/messages internes)
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- =====================================================================
create table if not exists notes_client (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  client text not null,
  auteur text,
  texte text not null,
  created_at timestamptz default now()
);
alter table notes_client enable row level security;
drop policy if exists "notesclient_membre" on notes_client;
create policy "notesclient_membre" on notes_client for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
