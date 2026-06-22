-- =====================================================================
-- MIGRATION 32 : paiement mixte (répartition par mode de paiement)
-- (déjà inclus dans SUPABASE_TOUT_EN_UN.sql — fichier séparé pour archive)
-- Ex: vente 2000 = 1000 espèces + 1000 Wave → {"especes":1000,"wave":1000}
-- =====================================================================
alter table historique add column if not exists paiements jsonb;
