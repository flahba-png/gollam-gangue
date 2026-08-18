-- ============================================================
-- GANGUÉ PLATFORM — SCHÉMA COMPLET (tout-en-un)
-- Colle TOUT ce fichier dans le SQL Editor de Supabase → Run
-- Idempotent : peut être relancé sans casser une base existante.
-- ============================================================

-- ========== BOUTIQUES (+ entrepôts) ==========
create table if not exists boutiques (
  id uuid default gen_random_uuid() primary key,
  proprietaire_id uuid references auth.users(id) on delete cascade,
  nom text not null,
  ville text,
  email text,
  type text default 'boutique',
  parent_id uuid references boutiques(id) on delete cascade,
  taux_tva numeric default 0,
  created_at timestamptz default now()
);
-- Mise à niveau d'une ancienne structure éventuelle
alter table boutiques add column if not exists proprietaire_id uuid references auth.users(id) on delete cascade;
alter table boutiques add column if not exists type text default 'boutique';
alter table boutiques add column if not exists parent_id uuid references boutiques(id) on delete cascade;
alter table boutiques add column if not exists taux_tva numeric default 0;
alter table boutiques drop constraint if exists boutiques_id_fkey;
alter table boutiques alter column id set default gen_random_uuid();
update boutiques set proprietaire_id = id where proprietaire_id is null;

-- ========== MEMBRES (employés) ==========
create table if not exists membres (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  proprietaire_id uuid references auth.users(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  nom text,
  role text default 'vendeur' check (role in ('gerant', 'vendeur')),
  telephone text,
  created_at timestamptz default now()
);
alter table membres add column if not exists telephone text;

-- ========== PRODUITS ==========
create table if not exists produits (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  nom text not null,
  prix_achat integer default 0,
  prix_vente integer default 0,
  stock integer default 0,
  created_at timestamptz default now()
);
alter table produits add column if not exists seuil_alerte integer default 2;
alter table produits add column if not exists code_barre text;
alter table produits add column if not exists reference_oem text;
alter table produits add column if not exists compatibilite text;
alter table produits add column if not exists frais_unitaire integer default 0;
alter table produits add column if not exists unites_par_carton integer default 1;
-- Tarification à paliers : demi-gros / gros + seuils de quantité (migration 35)
alter table produits add column if not exists prix_demi_gros integer default 0;
alter table produits add column if not exists prix_gros integer default 0;
alter table produits add column if not exists seuil_demi_gros integer default 0;
alter table produits add column if not exists seuil_gros integer default 0;
-- Mentions légales factures : RCCM + compte contribuable (migration 36)
alter table boutiques add column if not exists rccm text;
alter table boutiques add column if not exists ncc text;
-- Identité complète facture : statut juridique, siège, coordonnées de paiement (migration 37)
alter table boutiques add column if not exists statut_juridique text;
alter table boutiques add column if not exists siege text;
alter table boutiques add column if not exists infos_paiement text;
-- Photo des produits pour catalogue + pub d'article (migration 38)
alter table produits add column if not exists photo text;

-- ========== MIGRATION 39 : dettes fournisseurs ==========
create table if not exists dettes_fournisseurs (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  fournisseur_id uuid references fournisseurs(id) on delete set null,
  fournisseur_nom text not null,
  description text,
  total integer default 0,
  paye integer default 0,
  reste_a_payer integer default 0,
  echeance date,
  date text,
  cree_par text,
  created_at timestamptz default now()
);
alter table dettes_fournisseurs enable row level security;
drop policy if exists "dettes_fourn_membre" on dettes_fournisseurs;
create policy "dettes_fourn_membre" on dettes_fournisseurs for all
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()))
  with check (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()));

-- ========== HISTORIQUE ==========
create table if not exists historique (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  heure text,
  date_iso text,
  texte text,
  type text,
  montant integer default 0,
  benefice_etabli integer default 0,
  details_facture jsonb,
  created_at timestamptz default now()
);
alter table historique add column if not exists mode_paiement text default 'especes';
alter table historique add column if not exists vendeur_nom text;
alter table historique drop constraint if exists historique_type_check;
alter table historique add constraint historique_type_check
  check (type in ('vente', 'depense', 'ajout', 'transfert', 'retour', 'inventaire'));

-- ========== CRÉDITS ==========
create table if not exists credits (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  client text not null,
  article text,
  total integer default 0,
  avance integer default 0,
  reste_a_payer integer default 0,
  date text,
  created_at timestamptz default now()
);
alter table credits add column if not exists client_phone text;
alter table credits add column if not exists mode_paiement text default 'especes';

-- ========== FOURNISSEURS + lien produit ==========
create table if not exists fournisseurs (
  id uuid default gen_random_uuid() primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  nom text not null,
  telephone text,
  created_at timestamptz default now()
);
alter table produits add column if not exists fournisseur_id uuid references fournisseurs(id) on delete set null;

-- ========== COMMANDES (réassort) ==========
create table if not exists commandes (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  fournisseur_id uuid references fournisseurs(id) on delete set null,
  fournisseur_nom text,
  lignes jsonb not null,
  total integer default 0,
  statut text default 'en_cours' check (statut in ('en_cours', 'recue', 'annulee')),
  date text,
  created_at timestamptz default now()
);

-- ========== TRANSFERTS de stock ==========
create table if not exists transferts (
  id bigint generated always as identity primary key,
  proprietaire_id uuid references auth.users(id) on delete cascade not null,
  source_id uuid references boutiques(id) on delete cascade not null,
  dest_id uuid references boutiques(id) on delete cascade not null,
  produit_nom text not null,
  prix_achat integer default 0,
  prix_vente integer default 0,
  quantite integer not null,
  statut text default 'en_attente' check (statut in ('en_attente', 'recu', 'annule')),
  date_envoi text,
  created_at timestamptz default now()
);

-- ========== CLÔTURES de caisse ==========
create table if not exists clotures (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  vendeur_nom text,
  date text,
  fond_caisse integer default 0,
  ventes_especes integer default 0,
  attendu_especes integer default 0,
  compte_especes integer default 0,
  ecart integer default 0,
  totaux_modes jsonb,
  created_at timestamptz default now()
);

-- ========== PLAFONDS de crédit client ==========
create table if not exists plafonds (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  client text not null,
  plafond integer default 0,
  created_at timestamptz default now(),
  unique (boutique_id, client)
);

-- ========== MESSAGES (chat d'équipe) ==========
create table if not exists messages (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  expediteur_id uuid,
  expediteur_nom text,
  texte text not null,
  created_at timestamptz default now()
);

-- ========== ABONNEMENTS (monétisation) ==========
create table if not exists abonnements (
  proprietaire_id uuid references auth.users(id) on delete cascade primary key,
  email text,
  nom text,
  plan text default 'essai',
  date_fin timestamptz,
  montant integer default 18000,
  created_at timestamptz default now()
);

-- ========== DOCUMENTS (devis, factures, bons de livraison) ==========
create table if not exists documents (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  type text not null check (type in ('devis', 'facture', 'bon_livraison')),
  numero text,
  client text,
  client_phone text,
  lignes jsonb not null,
  remise integer default 0,
  taux_tva numeric default 0,
  total_ht integer default 0,
  total_ttc integer default 0,
  statut text default 'en_attente',
  date text,
  validite text,
  notes text,
  created_at timestamptz default now()
);

-- ========== INDEX ==========
create index if not exists idx_produits_code_barre on produits (boutique_id, code_barre);
create index if not exists idx_produits_oem on produits (boutique_id, reference_oem);

-- ============================================================
-- SÉCURITÉ (Row Level Security)
-- ============================================================
alter table boutiques enable row level security;
alter table membres enable row level security;
alter table produits enable row level security;
alter table historique enable row level security;
alter table credits enable row level security;
alter table fournisseurs enable row level security;
alter table commandes enable row level security;
alter table transferts enable row level security;
alter table clotures enable row level security;
alter table plafonds enable row level security;
alter table abonnements enable row level security;
alter table documents enable row level security;
alter table messages enable row level security;

-- Helper : accès propriétaire OU employé d'une boutique
--   boutique_id in (mes boutiques possédées) OR (mes boutiques en tant qu'employé)

-- BOUTIQUES
drop policy if exists "boutique_own" on boutiques;
create policy "boutique_own" on boutiques for all
  using (proprietaire_id = auth.uid())
  with check (proprietaire_id = auth.uid());
drop policy if exists "boutiques_membre_select" on boutiques;
create policy "boutiques_membre_select" on boutiques for select
  using (id in (select boutique_id from membres where user_id = auth.uid()));

-- MEMBRES
drop policy if exists "membres_owner" on membres;
create policy "membres_owner" on membres for all
  using (proprietaire_id = auth.uid())
  with check (proprietaire_id = auth.uid());
drop policy if exists "membres_self" on membres;
create policy "membres_self" on membres for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));
drop policy if exists "membres_claim" on membres;
create policy "membres_claim" on membres for update
  using (lower(email) = lower(auth.jwt() ->> 'email'))
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

-- PRODUITS
drop policy if exists "produits_own" on produits;
create policy "produits_own" on produits for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- HISTORIQUE
drop policy if exists "historique_own" on historique;
create policy "historique_own" on historique for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- CRÉDITS
drop policy if exists "credits_own" on credits;
create policy "credits_own" on credits for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- FOURNISSEURS
drop policy if exists "fournisseurs_own" on fournisseurs;
create policy "fournisseurs_own" on fournisseurs for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- COMMANDES
drop policy if exists "commandes_own" on commandes;
create policy "commandes_own" on commandes for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- TRANSFERTS
drop policy if exists "transferts_own" on transferts;
create policy "transferts_own" on transferts for all
  using (proprietaire_id = auth.uid())
  with check (proprietaire_id = auth.uid());

-- CLÔTURES
drop policy if exists "clotures_own" on clotures;
create policy "clotures_own" on clotures for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- PLAFONDS
drop policy if exists "plafonds_own" on plafonds;
create policy "plafonds_own" on plafonds for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- ABONNEMENTS
drop policy if exists "abonnement_self" on abonnements;
create policy "abonnement_self" on abonnements for all
  using (proprietaire_id = auth.uid())
  with check (proprietaire_id = auth.uid());
drop policy if exists "abonnement_admin" on abonnements;
create policy "abonnement_admin" on abonnements for all
  using (lower(auth.jwt() ->> 'email') = 'flahba@icloud.com')
  with check (lower(auth.jwt() ->> 'email') = 'flahba@icloud.com');

-- DOCUMENTS
drop policy if exists "documents_own" on documents;
create policy "documents_own" on documents for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- MESSAGES
drop policy if exists "messages_own" on messages;
create policy "messages_own" on messages for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
do $$ begin
  alter publication supabase_realtime add table messages;
exception when others then null; end $$;

-- ========== ÉVOLUTIONS : permissions, audit, DM, relance ==========
alter table membres add column if not exists permissions jsonb;
alter table messages add column if not exists destinataire_id uuid;
alter table abonnements add column if not exists telephone text;

create table if not exists journal_audit (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  proprietaire_id uuid references auth.users(id) on delete cascade,
  user_nom text,
  action text,
  details jsonb,
  created_at timestamptz default now()
);
alter table journal_audit enable row level security;
drop policy if exists "audit_insert" on journal_audit;
create policy "audit_insert" on journal_audit for insert
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
drop policy if exists "audit_select_owner" on journal_audit;
create policy "audit_select_owner" on journal_audit for select
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid()));

-- Messages : DM visibles seulement par les 2 participants
drop policy if exists "messages_own" on messages;
create policy "messages_own" on messages for all
  using (
    (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()))
    and (destinataire_id is null or expediteur_id = auth.uid() or destinataire_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- ========== MIGRATION 22 : audit des modifications/suppressions ==========
-- Trace cachée de toute correction d'un mouvement (vente, stock, transfert).
create table if not exists logs_modifications (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  proprietaire_id uuid references auth.users(id) on delete cascade,
  table_cible text not null,          -- 'historique' | 'produits' | 'transferts'
  cible_id text,                       -- id de la ligne modifiée
  action text not null,                -- 'modification' | 'suppression'
  ancienne_valeur jsonb,
  nouvelle_valeur jsonb,
  user_nom text,
  created_at timestamptz default now()
);
alter table logs_modifications enable row level security;
-- Insertion autorisée à tout membre de la boutique (patron ou employé habilité)
drop policy if exists "logsmod_insert" on logs_modifications;
create policy "logsmod_insert" on logs_modifications for insert
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );
-- Lecture réservée au propriétaire (trace cachée)
drop policy if exists "logsmod_select_owner" on logs_modifications;
create policy "logsmod_select_owner" on logs_modifications for select
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid()));

-- ========== MIGRATION 23 : programme de fidélité (config par boutique) ==========
-- Points dérivés du total des achats (pas de table : calcul à la volée côté app).
alter table boutiques add column if not exists fidelite_active boolean default false;
alter table boutiques add column if not exists fidelite_seuil integer default 1000;      -- F dépensés pour 1 point
alter table boutiques add column if not exists fidelite_palier integer default 10;        -- points requis pour une récompense
alter table boutiques add column if not exists fidelite_valeur integer default 1000;      -- valeur (F) de la récompense

-- ========== MIGRATION 24 : caméras de surveillance (multi-flux par boutique) ==========
-- Liste de caméras [{ nom, url }] stockée sur la boutique (HLS/M3U8 lisible en navigateur).
alter table boutiques add column if not exists cameras jsonb default '[]'::jsonb;

-- ========== MIGRATION 25 : logo propre à chaque boutique (reçus/factures) ==========
-- Stocké en data URL (image redimensionnée côté app) → reçus white-label.
alter table boutiques add column if not exists logo text;

-- ========== MIGRATION 26 : catégorie des produits (tri/filtre catalogue) ==========
alter table produits add column if not exists categorie text;

-- ========== MIGRATION 27 : fil de suivi client (notes/messages internes) ==========
-- Messages texte attachés à un client (le client n'est pas un utilisateur de l'app).
create table if not exists notes_client (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  client text not null,
  auteur text,
  texte text not null,
  created_at timestamptz default now()
);
alter table notes_client enable row level security;
drop policy if exists "notesclient_membre" on notes_client;
create policy "notesclient_membre" on notes_client for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- ========== MIGRATION 28 : rachat des points de fidélité ==========
-- Chaque récompense utilisée consomme des points (les points effectifs d'un client
-- = points gagnés (total achats / seuil) − somme des points rachetés).
create table if not exists fidelite_rachats (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  client text not null,
  points integer not null default 0,
  valeur integer not null default 0,
  auteur text,
  created_at timestamptz default now()
);
alter table fidelite_rachats enable row level security;
drop policy if exists "fidrachat_membre" on fidelite_rachats;
create policy "fidrachat_membre" on fidelite_rachats for all
  using (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  )
  with check (
    boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
    or boutique_id in (select boutique_id from membres where user_id = auth.uid())
  );

-- ========== MIGRATION 29 : médias du chat (photos + notes vocales) ==========
alter table messages add column if not exists media_url text;
alter table messages add column if not exists media_type text;  -- 'image' | 'audio'

-- Espace de stockage des fichiers du chat
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

-- Lecture publique (URL aléatoire non devinable), upload réservé aux connectés
drop policy if exists "chatmedia_read" on storage.objects;
create policy "chatmedia_read" on storage.objects for select using (bucket_id = 'chat-media');
drop policy if exists "chatmedia_insert" on storage.objects;
create policy "chatmedia_insert" on storage.objects for insert to authenticated with check (bucket_id = 'chat-media');

-- ========== MIGRATION 30 : clients ajoutés manuellement ==========
create table if not exists clients (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  nom text not null,
  phone text,
  created_at timestamptz default now()
);
alter table clients enable row level security;
drop policy if exists "clients_membre" on clients;
create policy "clients_membre" on clients for all
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()))
  with check (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()));

-- ========== MIGRATION 31 : journal des erreurs (monitoring) ==========
create table if not exists erreurs (
  id bigint generated always as identity primary key,
  message text, stack text, url text, user_email text,
  created_at timestamptz default now()
);
alter table erreurs enable row level security;
-- tout utilisateur connecté peut logger une erreur
drop policy if exists "erreurs_insert" on erreurs;
create policy "erreurs_insert" on erreurs for insert to authenticated with check (true);
-- lecture réservée à l'admin (toi)
drop policy if exists "erreurs_admin" on erreurs;
create policy "erreurs_admin" on erreurs for select
  using (lower(auth.jwt() ->> 'email') = 'flahba@icloud.com');

-- ========== MIGRATION 32 : paiement mixte (répartition par mode) ==========
-- Ex: une vente de 2000 payée 1000 espèces + 1000 Wave → {"especes":1000,"wave":1000}
alter table historique add column if not exists paiements jsonb;

-- ========== MIGRATION 33 : bons de commande d'achat (PO formels) ==========
create table if not exists bons_commande (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  fournisseur_id uuid references fournisseurs(id) on delete set null,
  fournisseur_nom text,
  date date,
  prevu_le date,
  statut text default 'en_attente',   -- en_attente | recu_partiel | recu
  montant integer default 0,
  lignes jsonb default '[]'::jsonb,    -- [{ nom, qte, qte_recue, prix }]
  cree_par text,
  created_at timestamptz default now()
);
alter table bons_commande enable row level security;
drop policy if exists "boncmd_membre" on bons_commande;
create policy "boncmd_membre" on bons_commande for all
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()))
  with check (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()));

-- ========== MIGRATION 34 : campagnes de promotion ==========
create table if not exists promotions (
  id bigint generated always as identity primary key,
  boutique_id uuid references boutiques(id) on delete cascade not null,
  date_debut date,
  date_fin date,
  pourcentage integer default 0,
  notes text,
  produits jsonb default '[]'::jsonb,  -- liste de noms de produits ciblés
  cree_par text,
  created_at timestamptz default now()
);
alter table promotions enable row level security;
drop policy if exists "promo_membre" on promotions;
create policy "promo_membre" on promotions for all
  using (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()))
  with check (boutique_id in (select id from boutiques where proprietaire_id = auth.uid())
     or boutique_id in (select boutique_id from membres where user_id = auth.uid()));

-- ✅ Terminé. Toutes les tables, colonnes et règles de sécurité sont en place.
