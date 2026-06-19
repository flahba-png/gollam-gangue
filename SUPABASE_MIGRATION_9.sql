-- MIGRATION 9 : Code-barres sur les produits
-- Colle dans SQL Editor de Supabase → Run

alter table produits add column if not exists code_barre text;

-- Recherche rapide par code-barres (par boutique)
create index if not exists idx_produits_code_barre on produits (boutique_id, code_barre);
