import { describe, it, expect } from "vitest";
import { genererJournalSYSCOHADA } from "../compta";

const boutique = { nom: "Test", taux_tva: 0 };
const boutiqueTVA = { nom: "Test", taux_tva: 18 };

const sommeCompte = (lignes, compte) => ({
  debit: lignes.filter(l => l.compte === compte).reduce((s, l) => s + l.debit, 0),
  credit: lignes.filter(l => l.compte === compte).reduce((s, l) => s + l.credit, 0),
});

describe("SYSCOHADA — équilibre de la partie double", () => {
  it("toute combinaison d'opérations donne débits = crédits", () => {
    const histo = [
      { id: 1, type: "vente", date_iso: "2026-07-01", montant: 10000, mode_paiement: "especes", details_facture: { type: "Vente Comptant" } },
      { id: 2, type: "vente", date_iso: "2026-07-02", montant: 2000, mode_paiement: "wave", details_facture: { type: "Vente à Crédit", client: "Koffi", total: 9000, reste: 7000 } },
      { id: 3, type: "vente", date_iso: "2026-07-03", montant: 3000, mode_paiement: "especes", details_facture: { type: "Remboursement Partiel", client: "Koffi" } },
      { id: 4, type: "retour", date_iso: "2026-07-04", montant: 1500, mode_paiement: "especes", details_facture: { total: 1500 } },
      { id: 5, type: "depense", date_iso: "2026-07-05", montant: 800, mode_paiement: "orange" },
    ];
    const r = genererJournalSYSCOHADA(histo, boutique);
    expect(r.equilibre).toBe(true);
    expect(r.totalDebit).toBe(r.totalCredit);
  });
});

describe("SYSCOHADA — affectation des comptes", () => {
  it("vente comptant : caisse au débit, 701 au crédit", () => {
    const r = genererJournalSYSCOHADA([{ id: 1, type: "vente", date_iso: "2026-07-01", montant: 5000, mode_paiement: "especes", details_facture: {} }], boutique);
    expect(sommeCompte(r.lignes, "571").debit).toBe(5000);
    expect(sommeCompte(r.lignes, "701").credit).toBe(5000);
  });

  it("vente à crédit : CA constaté sur le TOTAL, créance 4111, avance encaissée", () => {
    const r = genererJournalSYSCOHADA([{
      id: 2, type: "vente", date_iso: "2026-07-01", montant: 2000, mode_paiement: "wave",
      details_facture: { type: "Vente à Crédit", client: "Koffi", total: 9000 },
    }], boutique);
    expect(sommeCompte(r.lignes, "701").credit).toBe(9000);        // CA total
    const c4111 = sommeCompte(r.lignes, "4111");
    expect(c4111.debit).toBe(9000);                                 // créance totale
    expect(c4111.credit).toBe(2000);                                // réduite de l'avance
    expect(sommeCompte(r.lignes, "5721").debit).toBe(2000);         // avance en caisse Wave
    expect(r.equilibre).toBe(true);
  });

  it("un versement client ne repasse JAMAIS en chiffre d'affaires (701)", () => {
    const r = genererJournalSYSCOHADA([{
      id: 3, type: "vente", date_iso: "2026-07-02", montant: 3000, mode_paiement: "especes",
      details_facture: { type: "Solde de Compte", client: "Koffi" },
    }], boutique);
    expect(sommeCompte(r.lignes, "701").credit).toBe(0);            // pas de CA
    expect(sommeCompte(r.lignes, "4111").credit).toBe(3000);        // créance soldée
    expect(sommeCompte(r.lignes, "571").debit).toBe(3000);
  });

  it("dépense : 628 au débit, caisse du bon mode au crédit", () => {
    const r = genererJournalSYSCOHADA([{ id: 4, type: "depense", date_iso: "2026-07-03", montant: 800, mode_paiement: "orange" }], boutique);
    expect(sommeCompte(r.lignes, "628").debit).toBe(800);
    expect(sommeCompte(r.lignes, "5722").credit).toBe(800);
  });

  it("retour avec dette réduite : avoir sur 4111, remboursement caisse pour le surplus", () => {
    const r = genererJournalSYSCOHADA([{
      id: 5, type: "retour", date_iso: "2026-07-04", montant: 500, mode_paiement: "especes",
      details_facture: { total: 2000, dette_reduite: 1500 },
    }], boutique);
    expect(sommeCompte(r.lignes, "701").debit).toBe(2000);          // CA annulé
    expect(sommeCompte(r.lignes, "4111").credit).toBe(1500);        // dette réduite
    expect(sommeCompte(r.lignes, "571").credit).toBe(500);          // cash remboursé
    expect(r.equilibre).toBe(true);
  });

  it("paiement mixte : chaque caisse reçoit sa part", () => {
    const r = genererJournalSYSCOHADA([{
      id: 6, type: "vente", date_iso: "2026-07-05", montant: 10000, mode_paiement: "mixte",
      paiements: { especes: 6000, wave: 4000 }, details_facture: {},
    }], boutique);
    expect(sommeCompte(r.lignes, "571").debit).toBe(6000);
    expect(sommeCompte(r.lignes, "5721").debit).toBe(4000);
    expect(r.equilibre).toBe(true);
  });
});

describe("SYSCOHADA — TVA", () => {
  it("ventile HT et TVA facturée (4431) sur une vente comptant", () => {
    const r = genererJournalSYSCOHADA([{ id: 1, type: "vente", date_iso: "2026-07-01", montant: 11800, mode_paiement: "especes", details_facture: {} }], boutiqueTVA);
    expect(sommeCompte(r.lignes, "701").credit).toBe(10000);        // HT
    expect(sommeCompte(r.lignes, "4431").credit).toBe(1800);        // TVA 18%
    expect(r.equilibre).toBe(true);
  });
});

describe("SYSCOHADA — filtre période", () => {
  it("ne garde que le mois demandé", () => {
    const histo = [
      { id: 1, type: "vente", date_iso: "2026-06-15", montant: 1000, mode_paiement: "especes", details_facture: {} },
      { id: 2, type: "vente", date_iso: "2026-07-15", montant: 2000, mode_paiement: "especes", details_facture: {} },
    ];
    const r = genererJournalSYSCOHADA(histo, boutique, "2026-07");
    expect(sommeCompte(r.lignes, "701").credit).toBe(2000);
  });
});
