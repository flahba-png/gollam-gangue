-- OUTIL DE TEST : forcer l'expiration d'un abonnement pour voir le paywall
-- Remplace l'email par celui du COMPTE TEST (pas ton compte admin !)
-- Colle dans Supabase → SQL Editor → Run

update abonnements
set date_fin = now() - interval '1 day', plan = 'essai'
where lower(email) = lower('email-du-compte-test@exemple.com');

-- Pour vérifier :
-- select email, plan, date_fin from abonnements;
