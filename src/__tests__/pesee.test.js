import { describe, it, expect } from "vitest";
import { calculerPesee, lireTrame, poidsStable, alertesPesee, cumulProducteur, texteTicket, CULTURES } from "../pesee";

describe("calculerPesee", () => {
  it("retire la tare des sacs et paie au kilo", () => {
    const c = calculerPesee({ pesees: [62.5, 63.5], nbSacs: 2, tareSac: 1, prixKg: 2000 });
    expect(c.brut).toBe(126);
    expect(c.tare).toBe(2);
    expect(c.net).toBe(124);
    expect(c.montant).toBe(248000);
  });
  it("applique la réfaction humidité (matière sèche) au-delà de la norme", () => {
    // 100 kg à 10 % pour une norme à 8 % → 100 × 90 / 92 = 97,83 kg
    const c = calculerPesee({ pesees: [100], humidite: 10, humiditeNorme: 8, prixKg: 1000 });
    expect(c.refactionHumidite).toBeCloseTo(2.17, 2);
    expect(c.net).toBeCloseTo(97.83, 2);
  });
  it("ne pénalise pas une humidité sous la norme", () => {
    const c = calculerPesee({ pesees: [100], humidite: 6, humiditeNorme: 8 });
    expect(c.refactionHumidite).toBe(0);
    expect(c.net).toBe(100);
  });
  it("déduit uniquement l'excès d'impuretés", () => {
    const c = calculerPesee({ pesees: [200], impuretes: 3.5, impuretesNorme: 1.5 });
    expect(c.refactionImpuretes).toBe(4);
    expect(c.net).toBe(196);
    expect(c.tauxRefaction).toBe(2);
  });
  it("ajuste le prix selon le grade et la prime", () => {
    const c = calculerPesee({ pesees: [10], prixKg: 2000, ajustementGrade: -5, primeKg: 50 });
    expect(c.prixApplique).toBe(1950);
    expect(c.montant).toBe(19500);
  });
  it("ne descend jamais sous zéro", () => {
    const c = calculerPesee({ pesees: [1], nbSacs: 5, tareSac: 1, prixKg: 1000 });
    expect(c.net).toBe(0);
    expect(c.montant).toBe(0);
  });
});

describe("lireTrame", () => {
  it("lit une trame stable d'indicateur", () => {
    expect(lireTrame("ST,GS,+  0012.35kg")).toEqual({ kg: 12.35, stable: true });
  });
  it("repère une lecture instable", () => {
    expect(lireTrame("US,GS,+  0012.10kg").stable).toBe(false);
  });
  it("convertit grammes et livres", () => {
    expect(lireTrame("2500 g").kg).toBe(2.5);
    expect(lireTrame("+000100 lb").kg).toBeCloseTo(45.359, 3);
  });
  it("accepte la virgule et l'absence d'unité", () => {
    expect(lireTrame("W: 25,4")).toEqual({ kg: 25.4, stable: null });
  });
  it("ignore une trame vide ou illisible", () => {
    expect(lireTrame("")).toBeNull();
    expect(lireTrame("ERR")).toBeNull();
  });
});

describe("poidsStable", () => {
  it("valide quand les dernières lectures ne bougent plus", () => {
    expect(poidsStable([10, 40, 62.45, 62.5, 62.5, 62.45, 62.5])).toBeCloseTo(62.48, 2);
  });
  it("refuse tant que le sac bouge", () => {
    expect(poidsStable([60, 61, 62, 62.5, 63])).toBeNull();
  });
  it("ignore un plateau vide", () => {
    expect(poidsStable([0, 0, 0, 0, 0])).toBeNull();
  });
});

describe("alertesPesee", () => {
  it("signale saisie manuelle, sacs incohérents et doublons", () => {
    const calc = calculerPesee({ pesees: [300, 300], nbSacs: 2 });
    const a = alertesPesee({ calc, nbSacs: 2, saisieManuelle: true, pesees: [300, 300] });
    expect(a.length).toBe(3);
  });
  it("reste silencieux sur une pesée normale", () => {
    const calc = calculerPesee({ pesees: [62, 64], nbSacs: 2, tareSac: 1 });
    expect(alertesPesee({ calc, nbSacs: 2, pesees: [62, 64] })).toEqual([]);
  });
});

describe("cumulProducteur", () => {
  it("additionne les tickets du même producteur (casse ignorée)", () => {
    const h = [
      { details_facture: { type: "Pesée", producteur: "Koffi", net: 120, montant: 240000 } },
      { details_facture: { type: "Pesée", producteur: "koffi ", net: 80.5, montant: 161000 } },
      { details_facture: { type: "Pesée", producteur: "Awa", net: 50, montant: 100000 } },
      { details_facture: { type: "Vente Comptant" } },
    ];
    expect(cumulProducteur(h, "KOFFI")).toEqual({ tickets: 2, kg: 200.5, montant: 401000 });
  });
});

describe("texteTicket", () => {
  it("contient le poids net et le montant", () => {
    const calc = calculerPesee({ pesees: [100], humidite: 10, humiditeNorme: 8, prixKg: 1000 });
    const t = texteTicket({ numero: "A1", boutique: { nom: "Coop" }, culture: CULTURES[0], producteur: "Koffi", calc, humidite: 10, nbSacs: 1, date: "01/10/2026", heure: "08:00", fmt: n => `${n} F`, paye: true });
    expect(t).toContain("Poids net : 97.83 kg");
    expect(t).toContain("97830 F");
    expect(t).toContain("PAYÉ");
  });
});
