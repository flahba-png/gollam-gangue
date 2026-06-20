-- =====================================================================
-- MIGRATION 25 : logo propre à chaque boutique (en-tête des reçus/factures)
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- Image stockée en data URL (redimensionnée côté app) → reçus white-label.
-- =====================================================================
alter table boutiques add column if not exists logo text;
