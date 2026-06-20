-- =====================================================================
-- MIGRATION 26 : catégorie des produits (tri/filtre du catalogue)
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- =====================================================================
alter table produits add column if not exists categorie text;
