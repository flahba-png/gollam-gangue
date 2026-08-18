-- Migration 38 : photo des produits (compressée, stockée en data URL)
-- Sert au catalogue et à la génération de visuels publicitaires par article.
-- À coller dans Supabase → SQL Editor → RUN. Idempotent, sans risque.
alter table produits add column if not exists photo text;
