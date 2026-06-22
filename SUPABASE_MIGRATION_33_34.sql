-- =====================================================================
-- MIGRATIONS 33 & 34 : bons de commande d'achat + campagnes de promotion
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- =====================================================================

-- 33 : bons de commande d'achat
create table if not exists bons_commande (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  fournisseur_id uuid references fournisseurs(id) on delete set null,
  fournisseur_nom text,
  date date,
  prevu_le date,
  statut text default 'en_attente',
  montant integer default 0,
  lignes jsonb default '[]'::jsonb,
  cree_par text,
  created_at timestamptz default now()
);
alter table bons_commande enable row level security;
drop policy if exists "boncmd_membre" on bons_commande;
create policy "boncmd_membre" on bons_commande for all
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()))
  with check (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()));

-- 34 : promotions
create table if not exists promotions (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  date_debut date,
  date_fin date,
  pourcentage integer default 0,
  notes text,
  produits jsonb default '[]'::jsonb,
  cree_par text,
  created_at timestamptz default now()
);
alter table promotions enable row level security;
drop policy if exists "promo_membre" on promotions;
create policy "promo_membre" on promotions for all
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()))
  with check (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()));
