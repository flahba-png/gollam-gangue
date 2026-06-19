-- MIGRATION 20 : Chat d'équipe + téléphone des employés
-- Colle dans SQL Editor de Supabase → Run (déjà inclus dans SUPABASE_TOUT_EN_UN.sql)

-- Téléphone des employés (pour appeler / WhatsApp)
alter table membres add column if not exists telephone text;

-- Messages du chat d'équipe (par boutique)
create table if not exists messages (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  expediteur_id uuid,
  expediteur_nom text,
  texte text not null,
  created_at timestamptz default now()
);

alter table messages enable row level security;
drop policy if exists "messages_own" on messages;
create policy "messages_own" on messages for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- Temps réel (best-effort, ne casse pas si déjà activé)
do $$ begin
  alter publication supabase_realtime add table messages;
exception when others then null; end $$;
