// Tarification à paliers : détail, demi-gros, gros.
// Un produit peut définir prix_demi_gros / prix_gros et leurs seuils de quantité
// (seuil_demi_gros, seuil_gros). Au-delà d'un seuil, le prix du palier s'applique
// automatiquement ; le vendeur peut aussi forcer un palier à la main.

export const TARIFS = [
  { id: "detail",    label: "Détail" },
  { id: "demi_gros", label: "Demi-gros" },
  { id: "gros",      label: "Gros" },
];

export const labelPalier = (id) => (TARIFS.find(t => t.id === id) || {}).label || "Détail";

// Vrai si le produit a au moins un tarif de gros défini.
export const aDesPaliers = (p) => (parseInt(p?.prix_demi_gros) || 0) > 0 || (parseInt(p?.prix_gros) || 0) > 0;

// Palier applicable automatiquement pour une quantité donnée (selon les seuils).
export const palierAuto = (p, qte) => {
  const q = parseInt(qte) || 0;
  const pGros = parseInt(p?.prix_gros) || 0;
  const pDemi = parseInt(p?.prix_demi_gros) || 0;
  const sGros = parseInt(p?.seuil_gros) || 0;
  const sDemi = parseInt(p?.seuil_demi_gros) || 0;
  if (pGros > 0 && sGros > 0 && q >= sGros) return "gros";
  if (pDemi > 0 && sDemi > 0 && q >= sDemi) return "demi_gros";
  return "detail";
};

// Prix unitaire d'un palier donné (repli sur le prix de détail si non défini).
export const prixDuPalier = (p, palier) => {
  if (palier === "gros" && (parseInt(p?.prix_gros) || 0) > 0) return parseInt(p.prix_gros);
  if (palier === "demi_gros" && (parseInt(p?.prix_demi_gros) || 0) > 0) return parseInt(p.prix_demi_gros);
  return parseInt(p?.prix_vente) || 0;
};

// Prix appliqué : palier forcé si fourni, sinon palier automatique selon la quantité.
export const prixApplique = (p, qte, palierForce = null) => {
  const palier = palierForce && palierForce !== "auto" ? palierForce : palierAuto(p, qte);
  return { palier, pu: prixDuPalier(p, palier) };
};
