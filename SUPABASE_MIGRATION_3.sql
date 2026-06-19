-- MIGRATION 3 : Multi-boutiques (1 compte propriétaire = plusieurs boutiques)
-- Colle dans SQL Editor de Supabase → Run

-- 1. Ajouter le propriétaire (l'utilisateur qui possède la boutique)
alter table boutiques add column if not exists proprietaire_id uuid references auth.users(id) on delete cascade;

-- 2. Backfill : les boutiques existantes appartiennent à l'utilisateur dont l'id = boutique.id
update boutiques set proprietaire_id = id where proprietaire_id is null;

-- 3. Retirer l'ancienne contrainte qui forçait boutique.id = user.id
alter table boutiques drop constraint if exists boutiques_id_fkey;

-- 4. Les nouvelles boutiques reçoivent un id généré automatiquement
alter table boutiques alter column id set default gen_random_uuid();

-- 5. Le propriétaire devient obligatoire
alter table boutiques alter column proprietaire_id set not null;

-- 6. RLS : on accède aux données via le propriétaire des boutiques
drop policy if exists "boutique_own" on boutiques;
create policy "boutique_own" on boutiques for all
  using (proprietaire_id = auth.uid())
  with check (proprietaire_id = auth.uid());

drop policy if exists "produits_own" on produits;
create policy "produits_own" on produits for all
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid()))
  with check (boutique_id in (select id from boutiques where proprietaire_id = auth.uid()));

drop policy if exists "historique_own" on historique;
create policy "historique_own" on historique for all
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid()))
  with check (boutique_id in (select id from boutiques where proprietaire_id = auth.uid()));

drop policy if exists "credits_own" on credits;
create policy "credits_own" on credits for all
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid()))
  with check (boutique_id in (select id from boutiques where proprietaire_id = auth.uid()));
