-- MIGRATION 8 : Fournisseurs + réassort automatique
-- Colle dans SQL Editor de Supabase → Run

-- 1. Fournisseurs (par boutique)
create table if not exists fournisseurs (
  id uuid default gen_random_uuid() primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  nom text not null,
  telephone text,
  created_at timestamptz default now()
);

-- 2. Lier un produit à un fournisseur + seuil d'alerte de réassort
alter table produits add column if not exists fournisseur_id uuid references fournisseurs(id) on delete set null;
alter table produits add column if not exists seuil_alerte integer default 2;

-- 3. Commandes de réassort (bons de commande)
create table if not exists commandes (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  fournisseur_id uuid references fournisseurs(id) on delete set null,
  fournisseur_nom text,
  lignes jsonb not null,            -- [{ nom, quantite, prix_achat }]
  total integer default 0,
  statut text default 'en_cours' check (statut in ('en_cours', 'recue', 'annulee')),
  date text,
  created_at timestamptz default now()
);

-- 4. RLS : accès propriétaire OU employé de la boutique
alter table fournisseurs enable row level security;
alter table commandes enable row level security;

drop policy if exists "fournisseurs_own" on fournisseurs;
create policy "fournisseurs_own" on fournisseurs for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

drop policy if exists "commandes_own" on commandes;
create policy "commandes_own" on commandes for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
