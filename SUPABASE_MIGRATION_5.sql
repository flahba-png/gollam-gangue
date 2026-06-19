-- MIGRATION 5 : Entrepôt rattaché à une boutique parent
-- Colle dans SQL Editor de Supabase → Run

-- Un entrepôt (type = 'entrepot') appartient à une boutique parent.
-- parent_id reste NULL pour les boutiques normales.
alter table boutiques add column if not exists parent_id uuid references boutiques(id) on delete cascade;
