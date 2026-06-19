-- MIGRATION 14 : Plafond de crédit par client
-- Colle dans SQL Editor de Supabase → Run

create table if not exists plafonds (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  client text not null,
  plafond integer default 0,
  created_at timestamptz default now(),
  unique (boutique_id, client)
);

alter table plafonds enable row level security;
drop policy if exists "plafonds_own" on plafonds;
create policy "plafonds_own" on plafonds for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
