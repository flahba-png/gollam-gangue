-- =====================================================================
-- MIGRATION 23 : programme de fidélité (config par boutique)
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- Points dérivés du total des achats (calcul à la volée, pas de table).
-- =====================================================================
alter table boutiques add column if not exists fidelite_active boolean default false;
alter table boutiques add column if not exists fidelite_seuil integer default 1000;   -- F pour 1 point
alter table boutiques add column if not exists fidelite_palier integer default 10;     -- points pour une récompense
alter table boutiques add column if not exists fidelite_valeur integer default 1000;   -- valeur (F) de la récompense
