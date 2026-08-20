# Améliorations à faire — Gollam

> Liste vivante des détails repérés (usage terrain, veille concurrence).
> On coche au fur et à mesure. Rien ne se perd ici.

---

## 🎯 Structure cible du menu (définie par Amadou)

Le menu de bureau suit désormais cette organisation. Les cases **manquantes** sont listées en dessous.

| Section | Souhaité | État |
|---|---|---|
| **Accueil** | Accueil, Profil | ✅ complet |
| **Ventes** | Vente en détail, Bon de commande client, Crédits, Documents, Promotions | ⚠️ manque le *bon de commande client* (le devis en tient lieu) |
| **Stock** | Entrées, Sorties, Transfert, Ajustement | ⚠️ manque *Entrées* et *Sorties* en écrans dédiés |
| **Achats** | Bons de commande, Enregistrer facture fournisseur, Règlement, Factures fournisseurs, Dettes | ⚠️ facture/règlement partiellement couverts par Dettes fournisseurs |
| **Acteurs** | Clients, Fournisseurs, Utilisateurs | ⚠️ *Clients* est dans Messages, pas en entrée séparée |
| **Rapports** | Historique produits, Mouvement de stock, Rapport commercial, Rapport financier | ⚠️ tout est dans Stats + Historique, pas séparé |
| **Trésorerie** | Caisse, Ouverture/fermeture, Transactions | ⚠️ la *fermeture* existe (clôture), pas l'*ouverture* |
| **Contrôle** | Admin (réservé) | ✅ complet |

## 🔴 À faire en priorité

- [ ] **Sortie de stock directe avec motif** — aujourd'hui une pièce ne peut sortir que par une vente ou un inventaire complet. Manque : *produit + quantité + motif (casse, perte, vol, don, usage personnel, retour fournisseur) + validation*, avec rappel du stock disponible pendant la saisie et les 30 dernières sorties affichées juste en dessous. Complète l'angle anti-vol (chaque sortie a un motif ET un responsable).
- [ ] **Entrée de stock en écran dédié** — même principe que la sortie (aujourd'hui noyée dans Saisie → Stock).
- [ ] **Dépenses dans la clôture de caisse** — le filtre par vendeur ne compte que les ventes. Si un vendeur sort de l'argent, ça n'apparaît pas dans sa clôture.
- [ ] **Clients en entrée de menu séparée** (section Acteurs) — aujourd'hui il faut passer par Messages.

## 🟠 Structure comptable Achats / Rapports / Trésorerie

- [ ] **Factures fournisseurs** : liste complète (payées + impayées), aujourd'hui Dettes fournisseurs ne montre que les impayées.
- [ ] **Enregistrer une facture fournisseur** et **Règlement** comme deux actions distinctes.
- [ ] **Rapports séparés** : mouvement de stock, rapport commercial, rapport financier (tout est fondu dans Stats aujourd'hui).
- [ ] **Ouverture de caisse** (fond de caisse du matin) en plus de la clôture du soir.
- [ ] **Bon de commande client** (commande d'un client avant livraison), distinct du bon de commande fournisseur.

## 🟠 Utile, pas urgent

- [ ] **Numérotation des mouvements de stock** (N° entrée / N° sortie), comme les factures. Traçabilité et sérieux en cas de litige.
- [ ] **Écran de configuration des prix en masse** — modifier les tarifs de plusieurs produits d'un coup (aujourd'hui : un par un, ou passer par l'import Excel).
- [ ] **Notification des points de fidélité** — « Koffi, plus que 2 achats et tu gagnes 1 000 F » (le programme existe mais reste silencieux).
- [ ] **Annonce des nouveautés à la réception du stock** — proposer d'envoyer un message aux clients quand un article attendu arrive.

## 🟡 Confort

- [ ] **Choix des colonnes** dans les tableaux (vu chez la concurrence, surtout utile sur ordinateur).
- [ ] **Découper `App.jsx`** (plus de 1000 lignes) — dette technique, aucun impact utilisateur.

## 🔵 Gros chantiers (plus tard)

- [ ] **Catalogue public en ligne** par boutique + QR code au comptoir, avec commande WhatsApp par article.
- [ ] **Mobile Money par API** (Wave/Orange) — bloqué tant qu'il n'y a pas de compte marchand chez un agrégateur (CinetPay ou PayDunya).
- [ ] **Paie / CNPS** et **immobilisations** — uniquement si un client payant le demande.
- [ ] **Suppression complète d'un compte** (Edge Function avec clé admin) — aujourd'hui les données sont effacées mais l'identifiant reste.

---

## ✅ Fait récemment

- [x] Bouton **➕ Nouveau produit** dans l'onglet Stock (il fallait passer par Saisie avant)
- [x] **Qui a pris l'argent** sur les dépenses (bénéficiaire + saisi par)
- [x] Auteur affiché sur chaque opération, export Excel inclus
- [x] Photos produits + bouton **📣 Pub**
- [x] Tarifs détail / demi-gros / gros
- [x] Dettes fournisseurs + position nette au tableau de bord
- [x] Export SYSCOHADA, factures conformes (RCCM/NCC), rapport mensuel PDF + WhatsApp
- [x] Promos : annonce aux clients, affiche partageable, relance des clients endormis
- [x] Mise en page ordinateur (barre latérale)
- [x] Suppression d'une boutique, écran « Crée ta boutique »
