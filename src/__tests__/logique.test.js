import { describe, it, expect } from "vitest";
import { permsDe, PERMS_VENDEUR, PERMS_GERANT } from "../permissions";
import { ageEnJours, nb, fmt } from "../theme";
import { ventesParProduit, stocksDormants, caMensuel } from "../analytics";
import { msgErreur } from "../erreurs";
import { estIndisponible, estLocal, fusionnerLocal, tailleFilet, synchroniserFilets } from "../fallback";
import { palierAuto, prixDuPalier, prixApplique, aDesPaliers } from "../tarifs";

describe("permissions (permsDe)", () => {
  it("le propriétaire a tous les droits", () => {
    expect(permsDe({ estOwner: true, role: "proprietaire" })).toEqual(PERMS_GERANT);
  });
  it("le vendeur ne voit pas les bénéfices ni les prix d'achat", () => {
    const p = permsDe({ estOwner: false, role: "vendeur" });
    expect(p.benefice_voir).toBe(false);
    expect(p.prix_achat_voir).toBe(false);
    expect(p.credit_accorder).toBe(true);
  });
  it("le gérant a tout par défaut", () => {
    expect(permsDe({ estOwner: false, role: "gerant" })).toEqual(PERMS_GERANT);
  });
  it("les permissions personnalisées surchargent le rôle", () => {
    const p = permsDe({ estOwner: false, role: "vendeur", permissions: { benefice_voir: true } });
    expect(p.benefice_voir).toBe(true);   // surchargé
    expect(p.stock_modifier).toBe(false); // base vendeur conservée
  });
});

describe("ageEnJours", () => {
  it("calcule l'âge depuis created_at", () => {
    const rec = { created_at: new Date(Date.now() - 10 * 86400000).toISOString() };
    expect(ageEnJours(rec)).toBe(10);
  });
  it("parse une date fr jj/mm/aaaa", () => {
    const d = new Date(Date.now() - 5 * 86400000);
    const j = String(d.getDate()).padStart(2, "0");
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const age = ageEnJours({ date: `${j}/${m}/${d.getFullYear()}` });
    expect(age).toBeGreaterThanOrEqual(4);
    expect(age).toBeLessThanOrEqual(5);
  });
  it("renvoie 0 si aucune date", () => {
    expect(ageEnJours({})).toBe(0);
  });
});

describe("formatage montants", () => {
  it("nb formate un nombre", () => {
    expect(nb(0)).toBe("0");
    expect(nb(1000)).toMatch(/1.?000/);
  });
  it("fmt ajoute le symbole de devise", () => {
    expect(fmt(1000)).toMatch(/F$/);
    expect(fmt(1000)).toMatch(/1.?000/);
  });
});

describe("analytics — ventes par produit", () => {
  it("agrège un panier multi-lignes (CA + marge)", () => {
    const histo = [{
      type: "vente", benefice_etabli: 300,
      details_facture: { lignes: [{ nom: "Pneu", qte: 2, total: 1000 }, { nom: "Filtre", qte: 1, total: 500 }] },
    }];
    const r = ventesParProduit(histo);
    const pneu = r.find(x => x.nom === "Pneu");
    expect(pneu.unites).toBe(2);
    expect(pneu.ca).toBe(1000);
    // marge répartie au prorata du CA (1000/1500 de 300 = 200)
    expect(Math.round(pneu.marge)).toBe(200);
  });
  it("un retour diminue les unités et le CA", () => {
    const histo = [
      { type: "vente", benefice_etabli: 100, details_facture: { lignes: [{ nom: "X", qte: 3, total: 900 }] } },
      { type: "retour", benefice_etabli: -33, details_facture: { lignes: [{ nom: "X", qte: 1, total: 300 }] } },
    ];
    const x = ventesParProduit(histo).find(p => p.nom === "X");
    expect(x.unites).toBe(2);   // 3 vendus − 1 rendu
    expect(x.ca).toBe(600);     // 900 − 300
  });
});

describe("analytics — stocks dormants", () => {
  it("repère un produit en stock jamais vendu (capital bloqué)", () => {
    const produits = [{ nom: "Dormant", stock: 5, prix_achat: 100 }];
    const r = stocksDormants(produits, [], 30);
    expect(r).toHaveLength(1);
    expect(r[0].capitalBloque).toBe(500);
  });
  it("ignore un produit vendu récemment", () => {
    const produits = [{ nom: "Actif", stock: 5, prix_achat: 100 }];
    const histo = [{ type: "vente", date_iso: new Date().toISOString().split("T")[0], details_facture: { lignes: [{ nom: "Actif", qte: 1, total: 200 }] } }];
    expect(stocksDormants(produits, histo, 30)).toHaveLength(0);
  });
});

describe("analytics — CA mensuel", () => {
  it("renvoie n mois", () => {
    expect(caMensuel([], 6)).toHaveLength(6);
  });
});

describe("résilience — filet de sécurité (fallback)", () => {
  it("détecte une table absente (le cas qui plantait les clients)", () => {
    expect(estIndisponible({ message: "Could not find the table 'public.clients' in the schema cache" })).toBe(true);
    expect(estIndisponible({ message: 'relation "clients" does not exist' })).toBe(true);
  });
  it("détecte une coupure réseau", () => {
    expect(estIndisponible({ message: "Failed to fetch" })).toBe(true);
    expect(estIndisponible(new Error("NetworkError when attempting to fetch resource"))).toBe(true);
  });
  it("ne se déclenche pas sur une vraie erreur métier", () => {
    expect(estIndisponible({ message: "duplicate key value violates unique constraint" })).toBe(false);
    expect(estIndisponible({ message: "new row violates row-level security policy" })).toBe(false);
    expect(estIndisponible(null)).toBe(false);
  });
  it("reconnaît un id local vs un id de base", () => {
    expect(estLocal("local-123-ab")).toBe(true);
    expect(estLocal(42)).toBe(false);
    expect(estLocal(null)).toBe(false);
  });
  it("fusionne sans perdre les enregistrements de la base", () => {
    const base = [{ id: 1 }, { id: 2 }];
    expect(fusionnerLocal("cle_test_inexistante", base)).toEqual(base);
  });
  it("aucun élément à synchroniser sans boutique", () => {
    expect(tailleFilet(null)).toBe(0);
    expect(tailleFilet(undefined)).toBe(0);
  });
  it("la synchro ne tente rien sans boutique", async () => {
    await expect(synchroniserFilets(null)).resolves.toBe(0);
  });
});

describe("tarification à paliers (détail / demi-gros / gros)", () => {
  const p = { prix_vente: 1000, prix_demi_gros: 900, prix_gros: 800, seuil_demi_gros: 3, seuil_gros: 12 };
  it("applique le détail en dessous du premier seuil", () => {
    expect(palierAuto(p, 1)).toBe("detail");
    expect(palierAuto(p, 2)).toBe("detail");
    expect(prixDuPalier(p, "detail")).toBe(1000);
  });
  it("bascule en demi-gros au seuil (3) puis en gros au carton (12)", () => {
    expect(palierAuto(p, 3)).toBe("demi_gros");
    expect(palierAuto(p, 11)).toBe("demi_gros");
    expect(palierAuto(p, 12)).toBe("gros");
    expect(prixDuPalier(p, "gros")).toBe(800);
  });
  it("ignore un palier dont le prix n'est pas défini", () => {
    const sansGros = { prix_vente: 1000, prix_demi_gros: 900, seuil_demi_gros: 3, prix_gros: 0, seuil_gros: 0 };
    expect(palierAuto(sansGros, 50)).toBe("demi_gros"); // pas de prix gros → reste en demi-gros
    expect(prixDuPalier(sansGros, "gros")).toBe(1000);  // repli sur le détail
  });
  it("prixApplique respecte un palier forcé (profil acheteur)", () => {
    expect(prixApplique(p, 1, "gros")).toEqual({ palier: "gros", pu: 800 });
    expect(prixApplique(p, 1, "auto").palier).toBe("detail");
  });
  it("aDesPaliers détecte si un produit a des tarifs de gros", () => {
    expect(aDesPaliers(p)).toBe(true);
    expect(aDesPaliers({ prix_vente: 500 })).toBe(false);
  });
});

describe("UX erreurs — message clair (msgErreur)", () => {
  it("traduit une coupure réseau en message simple", () => {
    expect(msgErreur({ message: "Failed to fetch" })).toContain("Connexion");
  });
  it("ajoute le contexte fourni sur une erreur inconnue", () => {
    expect(msgErreur({ message: "boom" }, "L'import")).toContain("L'import");
  });
  it("traduit les erreurs d'authentification en français", () => {
    expect(msgErreur({ message: "Invalid login credentials" })).toContain("incorrect");
    expect(msgErreur({ message: "User already registered" })).toContain("existe déjà");
    expect(msgErreur({ message: "Password should be at least 6 characters" })).toContain("court");
  });
  it("ne laisse jamais passer de texte technique anglais", () => {
    const out = msgErreur({ message: "Could not find the table 'public.clients' in the schema cache" });
    expect(out).not.toMatch(/schema cache|public\./);
  });
});
