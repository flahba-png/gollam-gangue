-- MIGRATION 17 : TVA / fiscalité (taux par boutique)
-- Colle dans SQL Editor de Supabase → Run

-- Taux de TVA en % (0 = désactivé). En Côte d'Ivoire la TVA standard est 18.
alter table boutiques add column if not exists taux_tva numeric default 0;
