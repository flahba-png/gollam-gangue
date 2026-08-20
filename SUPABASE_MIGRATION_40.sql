-- Migration 40 : marque des produits (APSONIC, Yamaha, Haojue, TVS...)
-- Permet de filtrer et regrouper le catalogue par marque.
-- À coller dans Supabase → SQL Editor → RUN. Idempotent, sans risque.
alter table produits add column if not exists marque text;
