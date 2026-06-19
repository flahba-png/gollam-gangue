-- MIGRATION 2 : Modes de paiement + téléphone client
-- À coller dans le SQL Editor de Supabase et exécuter (Run)

-- Mode de paiement sur chaque opération (espèces, wave, orange, mtn, credit)
alter table historique add column if not exists mode_paiement text default 'especes';

-- Téléphone du client (pour reçus WhatsApp et relances)
alter table credits add column if not exists client_phone text;

-- Mode de paiement sur les crédits aussi (pour l'avance initiale)
alter table credits add column if not exists mode_paiement text default 'especes';
