-- =====================================================================
-- MIGRATION 24 : caméras de surveillance (multi-flux par boutique)
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- Liste [{ nom, url }] ; flux HLS/M3U8 lisibles directement en navigateur.
-- =====================================================================
alter table boutiques add column if not exists cameras jsonb default '[]'::jsonb;
