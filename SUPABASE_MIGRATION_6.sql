-- MIGRATION 6 : Autoriser les mouvements de stock dans l'historique
-- Colle dans SQL Editor de Supabase → Run

alter table historique drop constraint if exists historique_type_check;
alter table historique add constraint historique_type_check
  check (type in ('vente', 'depense', 'ajout', 'transfert'));
