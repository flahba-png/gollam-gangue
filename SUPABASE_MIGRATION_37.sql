-- Migration 37 : identité complète de la boutique sur les factures
-- statut juridique (EI, SARL...), siège social, et coordonnées de paiement
-- (ex : "Wave : 07 69 69 14 15 · Orange Money : ...") affichées sur les factures.
-- À coller dans Supabase → SQL Editor → RUN. Idempotent, sans risque.
alter table boutiques add column if not exists statut_juridique text;
alter table boutiques add column if not exists siege text;
alter table boutiques add column if not exists infos_paiement text;
