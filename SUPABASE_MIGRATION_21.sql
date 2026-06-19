-- MIGRATION 21 : Permissions employés, audit, DM, téléphone abonnement
-- Colle dans SQL Editor de Supabase → Run (inclus dans SUPABASE_TOUT_EN_UN.sql)

-- 1. Permissions fines par employé (jsonb)
alter table membres add column if not exists permissions jsonb;

-- 2. Messages privés (DM) : destinataire (null = canal groupe)
alter table messages add column if not exists destinataire_id uuid;

-- 3. Téléphone du gérant pour la relance d'abonnement (admin)
alter table abonnements add column if not exists telephone text;

-- 4. Journal d'audit secret (actions sensibles des employés)
create table if not exists journal_audit (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  proprietaire_id uuid references auth.users(id) on delete cascade,
  user_nom text,
  action text,
  details jsonb,
  created_at timestamptz default now()
);

alter table journal_audit enable row level security;
-- Insertion : tout membre de la boutique peut écrire dans le journal
drop policy if exists "audit_insert" on journal_audit;
create policy "audit_insert" on journal_audit for insert
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
-- Lecture : SEUL le propriétaire voit le journal (secret)
drop policy if exists "audit_select_owner" on journal_audit;
create policy "audit_select_owner" on journal_audit for select
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid()));

-- 5. RLS messages : on autorise aussi les DM (visibles par les 2 participants)
drop policy if exists "messages_own" on messages;
create policy "messages_own" on messages for all
  using (
    (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()))
    and (destinataire_id is null or expediteur_id = auth.uid() or destinataire_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
