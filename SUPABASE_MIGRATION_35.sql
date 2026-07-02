-- Migration 35 : tarification à paliers (détail / demi-gros / gros)
-- À coller dans Supabase → SQL Editor → RUN. Idempotent, sans risque.
alter table produits add column if not exists prix_demi_gros integer default 0;
alter table produits add column if not exists prix_gros integer default 0;
alter table produits add column if not exists seuil_demi_gros integer default 0;
alter table produits add column if not exists seuil_gros integer default 0;
