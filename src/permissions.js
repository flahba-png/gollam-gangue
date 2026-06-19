// ============================================================
// PERMISSIONS FINES DES EMPLOYÉS
// ============================================================

// Catégories + clés affichées dans le formulaire d'ajout d'employé
export const CATEGORIES_PERMS = [
  {
    titre: "📦 Stock",
    perms: [
      { id: "stock_modifier", label: "Ajouter / modifier du stock" },
      { id: "prix_achat_voir", label: "Voir les prix d'achat" },
    ],
  },
  {
    titre: "🛒 Ventes & Crédits",
    perms: [
      { id: "credit_accorder", label: "Accorder un crédit" },
      { id: "vente_modifier", label: "Modifier / supprimer une vente" }, // → journal d'audit
    ],
  },
  {
    titre: "💰 Finances",
    perms: [
      { id: "benefice_voir", label: "Voir le gain total (bénéfices)" },
      { id: "caisse_voir", label: "Accéder à la clôture de caisse" },
    ],
  },
];

export const TOUTES_PERMS = CATEGORIES_PERMS.flatMap(c => c.perms.map(p => p.id));

// Tout activé (gérant)
export const PERMS_GERANT = Object.fromEntries(TOUTES_PERMS.map(k => [k, true]));

// Vendeur : encaisse + crédit + clôture (à l'aveugle), mais pas les finances ni le stock
export const PERMS_VENDEUR = {
  stock_modifier: false,
  prix_achat_voir: false,
  credit_accorder: true,
  vente_modifier: false,
  benefice_voir: false,
  caisse_voir: true,
};

// Permissions effectives d'un utilisateur sur une boutique
export const permsDe = ({ estOwner, role, permissions }) => {
  if (estOwner) return PERMS_GERANT;           // le propriétaire a tout
  if (permissions && typeof permissions === "object") {
    // base selon le rôle, surchargée par les réglages personnalisés
    const base = role === "gerant" ? PERMS_GERANT : PERMS_VENDEUR;
    return { ...base, ...permissions };
  }
  return role === "gerant" ? PERMS_GERANT : PERMS_VENDEUR;
};
