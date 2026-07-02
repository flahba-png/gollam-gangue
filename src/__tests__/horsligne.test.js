import { describe, it, expect, beforeEach, vi } from "vitest";

// Supabase est mocké : on contrôle le résultat des insert sans réseau réel.
const insertMock = vi.fn();
vi.mock("../supabase", () => ({
  supabase: { from: () => ({ insert: insertMock }) },
}));

import { lireOutbox, ajouterOutbox, retirerOutbox, tailleOutbox } from "../outbox";
import { sauverCache, lireCache, ageCache } from "../cache";
import {
  lireLocal, ecrireLocal, ajouterLocal, supprimerLocal, majLocal,
  fusionnerLocal, tailleFilet, synchroniserTable,
} from "../fallback";

beforeEach(() => {
  localStorage.clear();
  insertMock.mockReset();
});

describe("outbox — file d'attente hors-ligne", () => {
  it("ajoute, compte et retire une opération", () => {
    expect(tailleOutbox()).toBe(0);
    const n = ajouterOutbox({ id: "op1", donnees: { action: "vente" } });
    expect(n).toBe(1);
    expect(tailleOutbox()).toBe(1);
    expect(lireOutbox()[0].id).toBe("op1");
    retirerOutbox("op1");
    expect(tailleOutbox()).toBe(0);
  });
  it("préserve l'ordre (FIFO) des opérations", () => {
    ajouterOutbox({ id: "a" }); ajouterOutbox({ id: "b" });
    expect(lireOutbox().map(x => x.id)).toEqual(["a", "b"]);
  });
});

describe("cache — instantané local", () => {
  it("sauve puis relit des données par périmètre", () => {
    sauverCache("boutique1", { produits: [{ nom: "Pneu" }] });
    const lu = lireCache("boutique1");
    expect(lu.produits[0].nom).toBe("Pneu");
    expect(lu._ts).toBeGreaterThan(0);
  });
  it("renvoie null si aucun cache", () => {
    expect(lireCache("inexistant")).toBe(null);
  });
  it("ageCache formate la fraîcheur", () => {
    expect(ageCache(Date.now())).toBe("à l'instant");
    expect(ageCache(Date.now() - 5 * 60000)).toMatch(/5 min/);
    expect(ageCache(0)).toBe("");
  });
});

describe("fallback — stockage local", () => {
  it("ajoute un enregistrement avec id local + date", () => {
    const cree = ajouterLocal("clients_b1", { nom: "Koffi" });
    expect(cree.id).toMatch(/^local-/);
    expect(cree._local).toBe(true);
    expect(lireLocal("clients_b1")).toHaveLength(1);
  });
  it("met à jour puis supprime un enregistrement local", () => {
    const c = ajouterLocal("k", { nom: "X" });
    majLocal("k", c.id, { nom: "Y" });
    expect(lireLocal("k")[0].nom).toBe("Y");
    supprimerLocal("k", c.id);
    expect(lireLocal("k")).toHaveLength(0);
  });
  it("fusionne locaux (en tête) + base", () => {
    ajouterLocal("k", { nom: "Local" });
    const r = fusionnerLocal("k", [{ nom: "Base" }]);
    expect(r.map(x => x.nom)).toEqual(["Local", "Base"]);
  });
  it("tailleFilet additionne les enregistrements des tables du filet", () => {
    ajouterLocal("clients_b1", { nom: "A" });
    ajouterLocal("promotions_b1", { pourcentage: 10 });
    expect(tailleFilet("b1")).toBe(2);
  });
});

describe("fallback — synchronisation vers la base", () => {
  it("remonte les locaux et vide le local quand l'insert réussit", async () => {
    ajouterLocal("clients_b1", { boutique_id: "b1", nom: "Koffi" });
    insertMock.mockResolvedValue({ error: null });
    const restants = await synchroniserTable("clients", "clients_b1");
    expect(restants).toBe(0);
    expect(lireLocal("clients_b1")).toHaveLength(0);
    // on n'envoie que les champs métier (pas id/_local/created_at)
    const envoye = insertMock.mock.calls[0][0];
    expect(envoye).toEqual({ boutique_id: "b1", nom: "Koffi" });
  });
  it("garde les locaux si la base est toujours indisponible", async () => {
    ajouterLocal("clients_b1", { boutique_id: "b1", nom: "Koffi" });
    insertMock.mockResolvedValue({ error: { message: "Could not find the table in the schema cache" } });
    const restants = await synchroniserTable("clients", "clients_b1");
    expect(restants).toBe(1);
    expect(lireLocal("clients_b1")).toHaveLength(1);
  });
});
