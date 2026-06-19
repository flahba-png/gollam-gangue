-- MIGRATION 16 : Multi-unité (carton ↔ pièce)
-- Colle dans SQL Editor de Supabase → Run

-- Nombre de pièces dans un carton. 1 = pas de gestion carton.
-- Le stock reste toujours stocké en pièces (unité de base).
alter table produits add column if not exists unites_par_carton integer default 1;
