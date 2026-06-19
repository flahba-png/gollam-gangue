-- MIGRATION 13 : Coût d'achat réel (frais de transport/dédouanement par unité)
-- Colle dans SQL Editor de Supabase → Run

-- Coût réel d'une pièce = prix_achat + frais_unitaire
alter table produits add column if not exists frais_unitaire integer default 0;
