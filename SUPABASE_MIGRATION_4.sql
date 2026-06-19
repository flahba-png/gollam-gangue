-- MIGRATION 4 : Entrepôts + Transferts de stock sécurisés
-- Colle dans SQL Editor de Supabase → Run

-- 1. Type de lieu : 'boutique' (vend + stocke) ou 'entrepot' (stocke seulement)
alter table boutiques add column if not exists type text default 'boutique'
  check (type in ('boutique', 'entrepot'));

-- 2. Table des transferts de stock entre lieux
create table if not exists transferts (
  id bigint generated always as identity primary key,
  proprietaire_id uuid references auth.users(id) on delete cascade not null,
  source_id uuid references boutiques(id) on delete cascade not null,
  dest_id uuid references boutiques(id) on delete cascade not null,
  produit_nom text not null,
  prix_achat integer default 0,
  prix_vente integer default 0,
  quantite integer not null,
  statut text default 'en_attente' check (statut in ('en_attente', 'recu', 'annule')),
  date_envoi text,
  created_at timestamptz default now()
);

-- 3. Sécurité : le propriétaire ne voit que ses propres transferts
alter table transferts enable row level security;
drop policy if exists "transferts_own" on transferts;
create policy "transferts_own" on transferts for all
  using (proprietaire_id = auth.uid())
  with check (proprietaire_id = auth.uid());
