-- Migration 39 : dettes fournisseurs (ce que la boutique DOIT à ses fournisseurs)
-- Miroir des crédits clients : total, déjà payé, reste à payer, échéance.
-- À coller dans Supabase → SQL Editor → RUN. Idempotent, sans risque.
create table if not exists dettes_fournisseurs (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  fournisseur_id uuid references fournisseurs(id) on delete set null,
  fournisseur_nom text not null,
  description text,
  total integer default 0,
  paye integer default 0,
  reste_a_payer integer default 0,
  echeance date,
  date text,
  cree_par text,
  created_at timestamptz default now()
);
alter table dettes_fournisseurs enable row level security;
drop policy if exists "dettes_fourn_membre" on dettes_fournisseurs;
create policy "dettes_fourn_membre" on dettes_fournisseurs for all
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()))
  with check (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()));
