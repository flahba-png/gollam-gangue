-- À coller dans l'éditeur SQL de ton projet Supabase

-- Table des boutiques (une par compte)
create table boutiques (
  id uuid references auth.users on delete cascade primary key,
  nom text not null,
  ville text,
  email text,
  created_at timestamptz default now()
);

-- Table des produits
create table produits (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  nom text not null,
  prix_achat integer default 0,
  prix_vente integer default 0,
  stock integer default 0,
  created_at timestamptz default now()
);

-- Table de l'historique (ventes, dépenses, ajouts)
create table historique (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  heure text,
  date_iso text,
  texte text,
  type text check (type in ('vente', 'depense', 'ajout')),
  montant integer default 0,
  benefice_etabli integer default 0,
  details_facture jsonb,
  created_at timestamptz default now()
);

-- Table des crédits clients
create table credits (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  client text not null,
  article text,
  total integer default 0,
  avance integer default 0,
  reste_a_payer integer default 0,
  date text,
  created_at timestamptz default now()
);

-- Sécurité : Row Level Security (chaque boutique ne voit que ses données)
alter table boutiques enable row level security;
alter table produits enable row level security;
alter table historique enable row level security;
alter table credits enable row level security;

create policy "boutique_own" on boutiques for all using (auth.uid() = id);
create policy "produits_own" on produits for all using (auth.uid() = boutique_id);
create policy "historique_own" on historique for all using (auth.uid() = boutique_id);
create policy "credits_own" on credits for all using (auth.uid() = boutique_id);
