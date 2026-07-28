-- Migration 36 : mentions légales sur les documents (conformité facture CI)
-- RCCM = registre du commerce ; NCC = numéro de compte contribuable.
-- À coller dans Supabase → SQL Editor → RUN. Idempotent, sans risque.
alter table boutiques add column if not exists rccm text;
alter table boutiques add column if not exists ncc text;
