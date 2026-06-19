-- MIGRATION 19 : Documents (devis, factures, bons de livraison)
-- Colle dans SQL Editor de Supabase → Run (déjà inclus dans SUPABASE_TOUT_EN_UN.sql)

create table if not exists documents (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  type text not null check (type in ('devis', 'facture', 'bon_livraison')),
  numero text,
  client text,
  client_phone text,
  lignes jsonb not null,
  remise integer default 0,
  taux_tva numeric default 0,
  total_ht integer default 0,
  total_ttc integer default 0,
  statut text default 'en_attente',
  date text,
  validite text,
  notes text,
  created_at timestamptz default now()
);

alter table documents enable row level security;
drop policy if exists "documents_own" on documents;
create policy "documents_own" on documents for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
