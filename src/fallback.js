// Filet de sécurité : permet à une fonctionnalité de marcher même si sa table
// n'existe pas encore en base, ou si le réseau est coupé. On bascule alors sur
// un stockage local (localStorage), et on resynchronise dès que possible.
// Objectif : l'utilisateur n'est JAMAIS bloqué par une erreur technique.

// Vrai si l'erreur signifie "indisponible côté base" : table/colonne absente, ou réseau.
export const estIndisponible = (e) => {
  const m = (e?.message || String(e || "")).toLowerCase();
  return (
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("find the table") ||
    m.includes("could not find the") ||
    m.includes("undefined column") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("network request failed") ||
    m.includes("fetch")
  );
};

export const lireLocal = (cle) => {
  try { return JSON.parse(localStorage.getItem(cle) || "[]"); } catch { return []; }
};

export const ecrireLocal = (cle, val) => {
  try { localStorage.setItem(cle, JSON.stringify(val)); } catch { /* quota plein : on ignore */ }
};

// Vrai si un enregistrement vient du stockage local (pas encore en base).
export const estLocal = (id) => String(id || "").startsWith("local-");

// Ajoute un enregistrement en local et renvoie l'objet créé (avec un id local + date).
export const ajouterLocal = (cle, item) => {
  const cree = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    _local: true,
    created_at: new Date().toISOString(),
    ...item,
  };
  const locaux = lireLocal(cle);
  locaux.push(cree);
  ecrireLocal(cle, locaux);
  return cree;
};

// Supprime un enregistrement local par id.
export const supprimerLocal = (cle, id) => {
  ecrireLocal(cle, lireLocal(cle).filter(x => String(x.id) !== String(id)));
};

// Met à jour un enregistrement local par id (fusionne les champs fournis).
export const majLocal = (cle, id, champs) => {
  ecrireLocal(cle, lireLocal(cle).map(x => String(x.id) === String(id) ? { ...x, ...champs } : x));
};

// Fusionne les enregistrements locaux (en tête) avec ceux de la base.
export const fusionnerLocal = (cle, enBase) => [...lireLocal(cle), ...(enBase || [])];

// --- Synchronisation : remonte vers la base les enregistrements gardés en local ---
import { supabase } from "./supabase";

// Tables couvertes par le filet, avec la clé localStorage associée (par boutique).
export const TABLES_FILET = [
  { table: "clients",        cle: (b) => `clients_${b}` },
  { table: "promotions",     cle: (b) => `promotions_${b}` },
  { table: "bons_commande",  cle: (b) => `bons_commande_${b}` },
];

const enLigne = () => (typeof navigator === "undefined" ? false : navigator.onLine);

// Tente d'insérer en base chaque enregistrement local ; retire ceux qui passent.
// Renvoie le nombre d'enregistrements restés en local (table encore absente, etc.).
export const synchroniserTable = async (table, cle) => {
  const locaux = lireLocal(cle);
  if (!locaux.length || !enLigne()) return locaux.length;
  const garde = [];
  for (const item of locaux) {
    const { id, _local, created_at, ...donnees } = item; // on n'envoie que les champs métier
    const { error } = await supabase.from(table).insert(donnees);
    if (error) garde.push(item); // échec (table absente, réseau…) : on réessaiera plus tard
  }
  ecrireLocal(cle, garde);
  return garde.length;
};

// Synchronise toutes les tables du filet pour une boutique. Renvoie le total restant.
export const synchroniserFilets = async (boutiqueId) => {
  if (!boutiqueId || !enLigne()) return tailleFilet(boutiqueId);
  let restants = 0;
  for (const t of TABLES_FILET) restants += await synchroniserTable(t.table, t.cle(boutiqueId));
  return restants;
};

// Nombre d'enregistrements actuellement gardés en local (toutes tables du filet).
export const tailleFilet = (boutiqueId) =>
  boutiqueId ? TABLES_FILET.reduce((s, t) => s + lireLocal(t.cle(boutiqueId)).length, 0) : 0;
