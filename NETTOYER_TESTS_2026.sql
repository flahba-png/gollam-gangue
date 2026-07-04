-- ============================================================
-- REMISE À ZÉRO DES DONNÉES DE TEST — Gollam (26 juin 2026)
-- Cible UNIQUEMENT les boutiques du compte flahba@icloud.com
-- (GANGUE.SERVICES, dépôt KLA, INTER-BLOCK, Ma Boutique...).
-- À coller dans Supabase → SQL Editor → RUN.
-- ⚠️ Irréversible : fais "Sauvegarder mes données" dans l'app avant si besoin.
-- ============================================================

-- Boutiques concernées (réutilisé partout ci-dessous)
create temp table _mes_boutiques as
  select b.id from boutiques b
  join auth.users u on u.id = b.proprietaire_id
  where u.email = 'flahba@icloud.com';

-- ===== SECTION A : mouvements & transactions de test =====
delete from historique          where boutique_id in (select id from _mes_boutiques);
delete from credits             where boutique_id in (select id from _mes_boutiques);
delete from clotures            where boutique_id in (select id from _mes_boutiques);
delete from notes_client        where boutique_id in (select id from _mes_boutiques);
delete from fidelite_rachats    where boutique_id in (select id from _mes_boutiques);
delete from plafonds            where boutique_id in (select id from _mes_boutiques);
delete from documents           where boutique_id in (select id from _mes_boutiques);
delete from bons_commande       where boutique_id in (select id from _mes_boutiques);
delete from promotions          where boutique_id in (select id from _mes_boutiques);
delete from commandes           where boutique_id in (select id from _mes_boutiques);
delete from transferts          where source_id  in (select id from _mes_boutiques)
                                   or dest_id    in (select id from _mes_boutiques);
delete from journal_audit       where boutique_id in (select id from _mes_boutiques);
delete from logs_modifications  where boutique_id in (select id from _mes_boutiques);
delete from messages            where boutique_id in (select id from _mes_boutiques);
delete from clients             where boutique_id in (select id from _mes_boutiques);

-- Journal d'erreurs technique (global, sans lien boutique) : on vide aussi
delete from erreurs;

-- ===== SECTION B : CATALOGUE PRODUITS (choisis UNE option) =====
-- Option B1 (par défaut) : GARDER le catalogue (noms, prix, tarifs gros)
-- mais remettre tous les stocks à zéro. Rien à faire, c'est déjà le cas
-- si tes stocks sont à 0. Sinon, décommente la ligne suivante :
-- update produits set stock = 0 where boutique_id in (select id from _mes_boutiques);

-- Option B2 : TOUT SUPPRIMER, catalogue compris (décommente pour l'activer) :
-- delete from produits where boutique_id in (select id from _mes_boutiques);

-- ===== VÉRIFICATION (doit afficher 0 partout, produits selon ton choix) =====
select 'historique' t, count(*) n from historique where boutique_id in (select id from _mes_boutiques)
union all select 'credits',        count(*) from credits        where boutique_id in (select id from _mes_boutiques)
union all select 'documents',      count(*) from documents      where boutique_id in (select id from _mes_boutiques)
union all select 'clients',        count(*) from clients        where boutique_id in (select id from _mes_boutiques)
union all select 'produits',       count(*) from produits       where boutique_id in (select id from _mes_boutiques);
