-- MIGRATION 18 : Abonnements (monétisation)
-- Colle dans SQL Editor de Supabase → Run
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql)

create table if not exists abonnements (
  proprietaire_id uuid references auth.users(id) on delete cascade primary key,
  email text,
  nom text,
  plan text default 'essai',          -- essai | actif | expire
  date_fin timestamptz,
  montant integer default 18000,
  created_at timestamptz default now()
);

alter table abonnements enable row level security;

-- Chaque propriétaire gère son propre abonnement
drop policy if exists "abonnement_self" on abonnements;
create policy "abonnement_self" on abonnements for all
  using (proprietaire_id = auth.uid())
  with check (proprietaire_id = auth.uid());

-- L'admin de la plateforme voit et active TOUS les abonnements
-- ⚠️ Mets ici TON email (le même que ADMIN_EMAIL dans src/config.js)
drop policy if exists "abonnement_admin" on abonnements;
create policy "abonnement_admin" on abonnements for all
  using (lower(auth.jwt() ->> 'email') = 'flahba@icloud.com')
  with check (lower(auth.jwt() ->> 'email') = 'flahba@icloud.com');
