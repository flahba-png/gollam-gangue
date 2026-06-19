-- =====================================================================
-- VÉRIFICATION DE LA SÉCURITÉ (RLS) — à coller dans Supabase SQL Editor
-- Ne modifie RIEN. Sert juste à confirmer que l'isolation des comptes
-- est bien active. Lance les 3 requêtes une par une.
-- =====================================================================

-- 1) RLS ACTIVÉE SUR CHAQUE TABLE ?
--    La colonne "rls_active" doit être TRUE pour TOUTES les lignes.
--    Si une table affiche FALSE => ses données sont exposées : relance
--    SUPABASE_TOUT_EN_UN.sql.
select
  c.relname                       as table_name,
  c.relrowsecurity                as rls_active,
  (select count(*) from pg_policies p where p.tablename = c.relname) as nb_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'boutiques','membres','produits','historique','credits',
    'fournisseurs','commandes','transferts','clotures','plafonds',
    'documents','messages','abonnements','journal_audit'
  )
order by rls_active asc, table_name;   -- les FALSE (problèmes) remontent en haut

-- 2) DÉTAIL DES POLICIES (qui peut voir quoi).
--    Vérifie notamment :
--      - abonnements : "abonnement_self" (chacun le sien) + "abonnement_admin" (toi)
--      - journal_audit : SELECT réservé au propriétaire (audit secret)
--      - messages : DM visibles seulement par les 2 participants
select tablename, policyname, cmd, qual as condition_lecture
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) TEST CONCRET D'ISOLATION (optionnel mais parlant).
--    Compte les boutiques visibles SOUS TON identité connectée.
--    Connecté en tant que toi => tu vois TES boutiques.
--    Un autre client lançant la même requête ne verra QUE les siennes.
select count(*) as mes_boutiques_visibles
from boutiques
where proprietaire_id = auth.uid();
