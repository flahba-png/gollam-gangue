-- MIGRATION 7 : Employés & rôles (comptes vendeurs rattachés à une boutique)
-- Colle dans SQL Editor de Supabase → Run

-- 1. Table des membres (employés rattachés à une boutique)
create table if not exists membres (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  proprietaire_id uuid references auth.users(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,  -- rempli quand l'employé crée/lie son compte
  email text not null,
  nom text,
  role text default 'vendeur' check (role in ('gerant', 'vendeur')),
  created_at timestamptz default now()
);

-- 2. Étiqueter chaque opération au nom du vendeur
alter table historique add column if not exists vendeur_nom text;

-- 3. RLS de la table membres
alter table membres enable row level security;

-- Le propriétaire gère les membres de ses boutiques
drop policy if exists "membres_owner" on membres;
create policy "membres_owner" on membres for all
  using (proprietaire_id = auth.uid())
  with check (proprietaire_id = auth.uid());

-- L'employé voit ses propres lignes (par email) et peut les "réclamer" (lier son user_id)
drop policy if exists "membres_self" on membres;
create policy "membres_self" on membres for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));
drop policy if exists "membres_claim" on membres;
create policy "membres_claim" on membres for update
  using (lower(email) = lower(auth.jwt() ->> 'email'))
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

-- 4. Les employés peuvent voir la boutique où ils sont membres
drop policy if exists "boutiques_membre_select" on boutiques;
create policy "boutiques_membre_select" on boutiques for select
  using (id in (select boutique_id from membres where user_id = auth.uid()));

-- 5. Les employés accèdent aux données de leur boutique (produits, historique, crédits)
drop policy if exists "produits_own" on produits;
create policy "produits_own" on produits for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

drop policy if exists "historique_own" on historique;
create policy "historique_own" on historique for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

drop policy if exists "credits_own" on credits;
create policy "credits_own" on credits for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
