-- Migration 41 : nouveau type de mouvement « sortie » (casse, perte, vol, don...)
-- Permet de sortir une pièce du stock sans passer par une vente ni un inventaire.
-- À coller dans Supabase → SQL Editor → RUN. Idempotent, sans risque.
alter table historique drop constraint if exists historique_type_check;
alter table historique add constraint historique_type_check
  check (type in ('vente', 'depense', 'ajout', 'transfert', 'retour', 'inventaire', 'sortie'));
