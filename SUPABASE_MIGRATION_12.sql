-- MIGRATION 12 : Référence OEM + compatibilité véhicule (pièces auto)
-- Colle dans SQL Editor de Supabase → Run

alter table produits add column if not exists reference_oem text;
alter table produits add column if not exists compatibilite text; -- ex: "Toyota Hilux 2010-2015, Corolla 2008+"

create index if not exists idx_produits_oem on produits (boutique_id, reference_oem);
