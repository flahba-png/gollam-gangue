-- MIGRATION 10 : Clôture de caisse (rapport Z)
-- Colle dans SQL Editor de Supabase → Run
-- NB : nécessite que les tables "boutiques" (migration 1) et "membres" (migration 7) existent.

-- Sécurité : on s'assure que "membres" existe (au cas où la migration 7 n'aurait pas été lancée)
create table if not exists membres (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  proprietaire_id uuid references auth.users(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  nom text,
  role text default 'vendeur' check (role in ('gerant', 'vendeur')),
  created_at timestamptz default now()
);

create table if not exists clotures (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  vendeur_nom text,
  date text,
  fond_caisse integer default 0,
  ventes_especes integer default 0,
  attendu_especes integer default 0,
  compte_especes integer default 0,
  ecart integer default 0,
  totaux_modes jsonb,
  created_at timestamptz default now()
);

alter table clotures enable row level security;
drop policy if exists "clotures_own" on clotures;
create policy "clotures_own" on clotures for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
