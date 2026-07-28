// Export comptable SYSCOHADA (normes OHADA) : journal en partie double + balance.
// Objectif : fournir au comptable du client des écritures directement importables,
// avec les comptes du plan SYSCOHADA révisé.
//
// Comptes utilisés :
//   571  Caisse espèces          5721..5724 Caisse mobile money (subdivisions internes)
//   4111 Clients (créances)      701  Ventes de marchandises
//   4431 État, TVA facturée      628  Autres charges externes (dépenses)
//
// Règles d'écriture :
//   Vente comptant   : D 57x (encaissé)         / C 701 (HT) + C 4431 (TVA)
//   Vente à crédit   : D 4111 (total TTC)       / C 701 (HT) + C 4431 (TVA)
//                      + si avance : D 57x / C 4111
//   Versement client : D 57x / C 4111 (jamais 701 : le CA a déjà été constaté)
//   Retour / avoir   : D 701 (HT) + D 4431      / C 4111 (dette réduite) et/ou C 57x (remboursé)
//   Dépense          : D 628 / C 57x

const COMPTES_CAISSE = {
  especes: { compte: "571", libelle: "Caisse espèces" },
  wave: { compte: "5721", libelle: "Caisse Wave" },
  orange: { compte: "5722", libelle: "Caisse Orange Money" },
  mtn: { compte: "5723", libelle: "Caisse MTN Money" },
  moov: { compte: "5724", libelle: "Caisse Moov Money" },
};
const caisseDe = (mode) => COMPTES_CAISSE[mode] || COMPTES_CAISSE.especes;

const LIBELLES = {
  "4111": "Clients", "701": "Ventes de marchandises",
  "4431": "État, TVA facturée", "628": "Autres charges externes",
};
export const libelleCompte = (c) => LIBELLES[c] || caisseLibelle(c) || c;
const caisseLibelle = (c) => Object.values(COMPTES_CAISSE).find(x => x.compte === c)?.libelle;

// Répartition HT/TVA d'un montant TTC selon le taux de la boutique
const ventilerTVA = (ttc, taux) => {
  if (!taux || taux <= 0) return { ht: ttc, tva: 0 };
  const ht = Math.round(ttc / (1 + taux / 100));
  return { ht, tva: ttc - ht };
};

// Encaissements d'une opération : [{compte, libelle, montant}] (gère le paiement mixte)
const encaissements = (h, montant) => {
  if (h.paiements && typeof h.paiements === "object" && Object.keys(h.paiements).length) {
    return Object.entries(h.paiements).map(([mode, m]) => ({ ...caisseDe(mode), montant: m }));
  }
  return montant > 0 ? [{ ...caisseDe(h.mode_paiement), montant }] : [];
};

// Vrai si ce mouvement "vente" est en réalité un versement sur crédit existant
const estVersement = (h) =>
  ["Remboursement Partiel", "Solde de Compte"].includes(h.details_facture?.type) ||
  (h.texte || "").includes("Versement");

// Génère les lignes du journal (partie double) pour une période AAAA-MM (ou tout si vide).
// Renvoie { lignes: [{date, journal, compte, libelle, description, debit, credit, piece}], balance, equilibre }
export const genererJournalSYSCOHADA = (historique, boutique, periode = "") => {
  const taux = parseFloat(boutique?.taux_tva) || 0;
  const rows = [...historique]
    .filter(h => !periode || (h.date_iso || "").startsWith(periode))
    .sort((a, b) => (a.date_iso + (a.heure || "")).localeCompare(b.date_iso + (b.heure || "")));

  const lignes = [];
  const L = (h, journal, compte, debit, credit, desc) => lignes.push({
    date: h.date_iso || "", journal, compte, libelle: libelleCompte(compte),
    description: desc || h.texte || "", debit: debit || 0, credit: credit || 0, piece: String(h.id ?? ""),
  });

  for (const h of rows) {
    const df = h.details_facture || {};
    const montant = h.montant || 0;

    if (h.type === "vente" && estVersement(h)) {
      // Versement sur crédit : caisse contre créance client (pas de CA)
      for (const e of encaissements(h, montant)) L(h, "CA", e.compte, e.montant, 0);
      if (montant > 0) L(h, "CA", "4111", 0, montant, `Versement ${df.client || ""}`.trim());

    } else if (h.type === "vente" && df.type === "Vente à Crédit") {
      // CA constaté sur le TOTAL de la vente ; la créance porte le reste
      const total = df.total || montant;
      const { ht, tva } = ventilerTVA(total, taux);
      L(h, "VE", "4111", total, 0, `Vente à crédit ${df.client || ""}`.trim());
      L(h, "VE", "701", 0, ht);
      if (tva > 0) L(h, "VE", "4431", 0, tva);
      // Avance encaissée immédiatement
      if (montant > 0) {
        for (const e of encaissements(h, montant)) L(h, "CA", e.compte, e.montant, 0, "Avance sur crédit");
        L(h, "CA", "4111", 0, montant, "Avance sur crédit");
      }

    } else if (h.type === "vente") {
      // Vente comptant
      const { ht, tva } = ventilerTVA(montant, taux);
      for (const e of encaissements(h, montant)) L(h, "VE", e.compte, e.montant, 0);
      L(h, "VE", "701", 0, ht);
      if (tva > 0) L(h, "VE", "4431", 0, tva);

    } else if (h.type === "retour") {
      // Avoir : on annule le CA ; contrepartie = créance réduite et/ou caisse remboursée
      const detteReduite = df.dette_reduite || 0;
      const totalAvoir = (df.total ?? (montant + detteReduite)) || 0;
      if (totalAvoir <= 0) continue;
      const { ht, tva } = ventilerTVA(totalAvoir, taux);
      L(h, "VE", "701", ht, 0);
      if (tva > 0) L(h, "VE", "4431", tva, 0);
      if (detteReduite > 0) L(h, "VE", "4111", 0, detteReduite, "Avoir sur crédit");
      const rembourse = totalAvoir - detteReduite;
      if (rembourse > 0) for (const e of encaissements(h, rembourse)) L(h, "VE", e.compte, 0, e.montant, "Remboursement client");

    } else if (h.type === "depense") {
      if (montant <= 0) continue;
      L(h, "CA", "628", montant, 0);
      for (const e of encaissements(h, montant)) L(h, "CA", e.compte, 0, e.montant);
    }
    // "ajout" (réceptions de stock) : hors journal — le coût d'achat réel passe
    // par les bons de commande / factures fournisseurs, à saisir en compta achats.
  }

  // Balance : totaux débit/crédit par compte
  const parCompte = new Map();
  for (const l of lignes) {
    const b = parCompte.get(l.compte) || { compte: l.compte, libelle: l.libelle, debit: 0, credit: 0 };
    b.debit += l.debit; b.credit += l.credit;
    parCompte.set(l.compte, b);
  }
  const balance = [...parCompte.values()].sort((a, b) => a.compte.localeCompare(b.compte))
    .map(b => ({ ...b, solde: b.debit - b.credit }));
  const totalDebit = lignes.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lignes.reduce((s, l) => s + l.credit, 0);

  return { lignes, balance, totalDebit, totalCredit, equilibre: totalDebit === totalCredit };
};

// Télécharge le journal + la balance en CSV (Excel, séparateur ;)
export const exporterSYSCOHADA = (historique, boutique, periode = "") => {
  const { lignes, balance, totalDebit, totalCredit } = genererJournalSYSCOHADA(historique, boutique, periode);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const contenu = [
    esc(`JOURNAL SYSCOHADA - ${boutique?.nom || "Boutique"}${periode ? " - " + periode : ""}`),
    esc(`RCCM : ${boutique?.rccm || "—"} / NCC : ${boutique?.ncc || "—"}`),
    "",
    ["Date", "Journal", "Compte", "Intitulé", "Libellé écriture", "Débit", "Crédit", "Pièce"].map(esc).join(";"),
    ...lignes.map(l => [l.date, l.journal, l.compte, l.libelle, l.description, l.debit || "", l.credit || "", l.piece].map(esc).join(";")),
    ["", "", "", "", esc("TOTAUX"), esc(totalDebit), esc(totalCredit), ""].join(";"),
    "",
    esc("BALANCE"),
    ["Compte", "Intitulé", "Débit", "Crédit", "Solde"].map(esc).join(";"),
    ...balance.map(b => [b.compte, b.libelle, b.debit, b.credit, b.solde].map(esc).join(";")),
  ].join("\n");

  const blob = new Blob(["﻿" + contenu], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `syscohada_${(boutique?.nom || "boutique").replace(/\W+/g, "_")}_${periode || "tout"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
