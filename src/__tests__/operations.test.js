import { describe, it, expect, beforeEach, vi } from "vitest";

// Supabase mocké : petit moteur de requêtes en mémoire qui enregistre les écritures.
const etat = { produits: {}, plafond: null, dettes: [], inserts: [], updates: [] };

vi.mock("../supabase", () => ({
  supabase: {
    from: (table) => {
      const b = { _table: table, _ilike: null };
      b.select = () => b;
      b.eq = () => b;
      b.ilike = (_col, val) => { b._ilike = String(val || "").replace(/%/g, ""); return b; };
      b.maybeSingle = async () => {
        if (table === "produits") return { data: etat.produits[b._ilike] || null };
        if (table === "plafonds") return { data: etat.plafond };
        return { data: null };
      };
      // `await builder` direct (liste des dettes du client)
      b.then = (resolve) => Promise.resolve({ data: table === "credits" ? etat.dettes : [] }).then(resolve);
      b.insert = async (row) => { etat.inserts.push({ table, row }); return { error: null }; };
      b.update = (patch) => ({ eq: async () => { etat.updates.push({ table, patch }); return { error: null }; } });
      return b;
    },
  },
}));

import { ecrireOperation } from "../operations";

const insere = (table) => etat.inserts.filter(i => i.table === table);

beforeEach(() => {
  etat.produits = {};
  etat.plafond = null;
  etat.dettes = [];
  etat.inserts = [];
  etat.updates = [];
});

describe("ecrireOperation — vente comptant", () => {
  it("décrémente le stock et journalise montant + bénéfice", async () => {
    etat.produits["Pneu"] = { id: 1, nom: "Pneu", stock: 10, prix_vente: 1000, prix_achat: 600, frais_unitaire: 50 };
    const r = await ecrireOperation({ action: "vente", lignes: [{ nom: "Pneu", quantite: 2, prixVente: 1000 }], isCredit: false, client: "", avance: 0 }, "b1", "Amadou");
    expect(r.ok).toBe(true);
    // Stock : 10 − 2 = 8
    expect(etat.updates.find(u => u.table === "produits").patch.stock).toBe(8);
    // Historique : total 2000, marge (1000−650)×2 = 700, vendeur étiqueté
    const log = insere("historique")[0].row;
    expect(log.montant).toBe(2000);
    expect(log.benefice_etabli).toBe(700);
    expect(log.vendeur_nom).toBe("Amadou");
  });

  it("refuse la vente si le stock est insuffisant, sans rien écrire", async () => {
    etat.produits["Filtre"] = { id: 2, nom: "Filtre", stock: 1, prix_vente: 500, prix_achat: 300 };
    const r = await ecrireOperation({ action: "vente", lignes: [{ nom: "Filtre", quantite: 5 }], isCredit: false, client: "", avance: 0 }, "b1");
    expect(r.ok).toBe(false);
    expect(r.err).toContain("Stock insuffisant");
    expect(etat.updates).toHaveLength(0);
    expect(etat.inserts).toHaveLength(0);
  });

  it("refuse un produit introuvable", async () => {
    const r = await ecrireOperation({ action: "vente", lignes: [{ nom: "Fantôme", quantite: 1 }], isCredit: false, client: "", avance: 0 }, "b1");
    expect(r.ok).toBe(false);
    expect(r.err).toContain("introuvable");
  });

  it("la remise sort du total ET de la marge", async () => {
    etat.produits["Pneu"] = { id: 1, nom: "Pneu", stock: 10, prix_vente: 1000, prix_achat: 600 };
    await ecrireOperation({ action: "vente", lignes: [{ nom: "Pneu", quantite: 1, prixVente: 1000 }], remise: 100, isCredit: false, client: "", avance: 0 }, "b1");
    const log = insere("historique")[0].row;
    expect(log.montant).toBe(900);          // 1000 − 100
    expect(log.benefice_etabli).toBe(300);  // 400 − 100
  });
});

describe("ecrireOperation — crédit et plafond", () => {
  it("bloque un crédit qui dépasse le plafond du client", async () => {
    etat.produits["Pneu"] = { id: 1, nom: "Pneu", stock: 10, prix_vente: 1000, prix_achat: 600 };
    etat.plafond = { plafond: 5000 };
    etat.dettes = [{ reste_a_payer: 4500 }];
    const r = await ecrireOperation({ action: "vente", lignes: [{ nom: "Pneu", quantite: 1, prixVente: 1000 }], isCredit: true, client: "Koffi", avance: 0 }, "b1");
    expect(r.ok).toBe(false);
    expect(r.err).toContain("Plafond dépassé");
    expect(etat.updates).toHaveLength(0); // le stock n'a pas bougé
  });

  it("accepte un crédit sous le plafond et crée la fiche de dette", async () => {
    etat.produits["Pneu"] = { id: 1, nom: "Pneu", stock: 10, prix_vente: 1000, prix_achat: 600 };
    etat.plafond = { plafond: 5000 };
    etat.dettes = [];
    const r = await ecrireOperation({ action: "vente", lignes: [{ nom: "Pneu", quantite: 1, prixVente: 1000 }], isCredit: true, client: "Koffi", avance: 200, clientPhone: "07" }, "b1");
    expect(r.ok).toBe(true);
    const credit = insere("credits")[0].row;
    expect(credit.reste_a_payer).toBe(800); // 1000 − 200 d'avance
    expect(credit.client).toBe("Koffi");
  });
});

describe("ecrireOperation — réception stock", () => {
  it("additionne au stock d'un produit existant", async () => {
    etat.produits["Pneu"] = { id: 1, nom: "Pneu", stock: 5, prix_vente: 1000, prix_achat: 600 };
    const r = await ecrireOperation({ action: "ajout", nom: "Pneu", quantite: 7, prixAchat: 650, prixVente: 1100 }, "b1");
    expect(r.ok).toBe(true);
    const patch = etat.updates.find(u => u.table === "produits").patch;
    expect(patch.stock).toBe(12);           // 5 + 7
    expect(patch.prix_achat).toBe(650);     // prix mis à jour
  });

  it("crée le produit s'il n'existe pas", async () => {
    const r = await ecrireOperation({ action: "ajout", nom: "Bougie", quantite: 10, prixAchat: 200, prixVente: 400 }, "b1");
    expect(r.ok).toBe(true);
    const prod = insere("produits")[0].row;
    expect(prod.nom).toBe("Bougie");
    expect(prod.stock).toBe(10);
  });
});

describe("ecrireOperation — paiement mixte", () => {
  it("étiquette 'mixte' quand plusieurs modes sont répartis", async () => {
    etat.produits["Pneu"] = { id: 1, nom: "Pneu", stock: 10, prix_vente: 1000, prix_achat: 600 };
    await ecrireOperation({ action: "vente", lignes: [{ nom: "Pneu", quantite: 1, prixVente: 1000 }], isCredit: false, client: "", avance: 0, paiements: { especes: 600, wave: 400 } }, "b1");
    const log = insere("historique")[0].row;
    expect(log.mode_paiement).toBe("mixte");
    expect(log.paiements).toEqual({ especes: 600, wave: 400 });
  });
});
