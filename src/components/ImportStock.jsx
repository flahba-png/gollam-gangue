import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, fmt } from "../theme";
import { supabase } from "../supabase";
import { msgErreur } from "../erreurs";
import { estIndisponible } from "../fallback";

// Import de stock en masse depuis un fichier Excel (.xlsx/.xls) ou CSV.
// Étapes : 1) fichier → 2) mappage colonnes → 3) aperçu + doublons → 4) import.
const CHAMPS = [
  { id: "nom", label: "Nom du produit", requis: true, mots: ["nom", "designation", "désignation", "produit", "article", "libelle", "libellé"] },
  { id: "prix_achat", label: "Prix d'achat", num: true, mots: ["achat", "cout", "coût", "revient"] },
  { id: "prix_vente", label: "Prix de vente (détail)", num: true, mots: ["vente", "detail", "détail", "prix", "pu", "tarif"] },
  { id: "prix_demi_gros", label: "Prix demi-gros", num: true, mots: ["demi-gros", "demigros", "demi gros", "demi"] },
  { id: "prix_gros", label: "Prix gros", num: true, mots: ["prix gros", "gros"] },
  { id: "seuil_demi_gros", label: "Seuil demi-gros (qté)", num: true, mots: ["seuil demi", "seuildemi", "min demi", "qte demi"] },
  { id: "seuil_gros", label: "Seuil gros (qté)", num: true, mots: ["seuil gros", "seuilgros", "min gros", "qte gros"] },
  { id: "stock", label: "Quantité / Stock", num: true, mots: ["stock", "quantite", "quantité", "qte", "qté", "dispo"] },
  { id: "marque", label: "Marque", mots: ["marque", "brand", "fabricant"] },
  { id: "categorie", label: "Catégorie", mots: ["categorie", "catégorie", "famille", "rayon", "type"] },
  { id: "reference_oem", label: "Référence (OEM)", mots: ["ref", "référence", "reference", "oem"] },
  { id: "code_barre", label: "Code-barres", mots: ["code", "barre", "barcode", "ean"] },
];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const toNum = (v) => {
  if (v == null || v === "") return 0;
  const n = parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? 0 : n;
};

export default function ImportStock({ produits, boutiqueId, onRefresh, onStatut, onClose }) {
  const [lignesBrutes, setLignesBrutes] = useState([]);   // tableaux de tableaux
  const [entetes, setEntetes] = useState([]);             // noms de colonnes
  const [mapping, setMapping] = useState({});             // champId -> index colonne
  const [modeDoublon, setModeDoublon] = useState("ignorer"); // ignorer | maj
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const nomsExistants = useMemo(
    () => new Set(produits.map(p => norm(p.nom))),
    [produits]
  );

  const lireFichier = async (file) => {
    setErreur("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
      if (rows.length < 2) { setErreur("Le fichier semble vide ou sans données."); return; }
      const head = rows[0].map(h => String(h).trim());
      const data = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ""));
      setEntetes(head);
      setLignesBrutes(data);
      // Auto-mappage par nom de colonne
      const auto = {};
      CHAMPS.forEach(ch => {
        // Première colonne ENCORE LIBRE qui correspond (évite que "demi-gros" vole la colonne "gros")
        const idx = head.findIndex((h, i) => !Object.values(auto).includes(i) && ch.mots.some(m => norm(h).includes(m)));
        if (idx >= 0) auto[ch.id] = idx;
      });
      setMapping(auto);
    } catch (e) {
      setErreur("Impossible de lire ce fichier : " + e.message);
    }
  };

  // Construit les produits prêts à importer (dédoublonnés par nom dans le fichier)
  const prepares = useMemo(() => {
    if (mapping.nom == null) return [];
    const parNom = new Map();
    for (const r of lignesBrutes) {
      const nom = String(r[mapping.nom] ?? "").trim();
      if (!nom) continue;
      const obj = {
        nom,
        prix_achat: mapping.prix_achat != null ? toNum(r[mapping.prix_achat]) : 0,
        prix_vente: mapping.prix_vente != null ? toNum(r[mapping.prix_vente]) : 0,
        prix_demi_gros: mapping.prix_demi_gros != null ? toNum(r[mapping.prix_demi_gros]) : 0,
        prix_gros: mapping.prix_gros != null ? toNum(r[mapping.prix_gros]) : 0,
        seuil_demi_gros: mapping.seuil_demi_gros != null ? toNum(r[mapping.seuil_demi_gros]) : 0,
        seuil_gros: mapping.seuil_gros != null ? toNum(r[mapping.seuil_gros]) : 0,
        stock: mapping.stock != null ? toNum(r[mapping.stock]) : 0,
        marque: mapping.marque != null ? String(r[mapping.marque] ?? "").trim() || null : null,
        categorie: mapping.categorie != null ? String(r[mapping.categorie] ?? "").trim() || null : null,
        reference_oem: mapping.reference_oem != null ? String(r[mapping.reference_oem] ?? "").trim() || null : null,
        code_barre: mapping.code_barre != null ? String(r[mapping.code_barre] ?? "").trim() || null : null,
      };
      const cle = norm(nom);
      if (parNom.has(cle)) {
        // Fusionne les doublons internes : additionne le stock, garde les prix non nuls
        const ex = parNom.get(cle);
        ex.stock += obj.stock;
        if (!ex.prix_achat) ex.prix_achat = obj.prix_achat;
        if (!ex.prix_vente) ex.prix_vente = obj.prix_vente;
        if (!ex.prix_demi_gros) ex.prix_demi_gros = obj.prix_demi_gros;
        if (!ex.prix_gros) ex.prix_gros = obj.prix_gros;
        if (!ex.seuil_demi_gros) ex.seuil_demi_gros = obj.seuil_demi_gros;
        if (!ex.seuil_gros) ex.seuil_gros = obj.seuil_gros;
        ex.marque = ex.marque || obj.marque;
        ex.categorie = ex.categorie || obj.categorie;
        ex.reference_oem = ex.reference_oem || obj.reference_oem;
        ex.code_barre = ex.code_barre || obj.code_barre;
      } else {
        parNom.set(cle, obj);
      }
    }
    return [...parNom.values()].map(o => ({ ...o, existant: nomsExistants.has(norm(o.nom)) }));
  }, [lignesBrutes, mapping, nomsExistants]);

  const nbNouveaux = prepares.filter(p => !p.existant).length;
  const nbDoublons = prepares.filter(p => p.existant).length;

  const importer = async () => {
    if (mapping.nom == null) { setErreur("Indique au moins la colonne du nom de produit."); return; }
    if (prepares.length === 0) { setErreur("Aucune ligne valide à importer."); return; }
    setEnCours(true);
    setErreur("");
    try {
      // 1. Nouveaux produits : insertion en lot.
      // Les colonnes de tarifs gros ne sont envoyées que si elles sont mappées
      // (et si la base ne les connaît pas encore, on réessaie sans elles).
      const avecGros = ["prix_demi_gros", "prix_gros", "seuil_demi_gros", "seuil_gros", "marque"].some(k => mapping[k] != null);
      const sansGros = (row) => { const { prix_demi_gros, prix_gros, seuil_demi_gros, seuil_gros, marque, ...reste } = row; return reste; };
      const nouveaux = prepares.filter(p => !p.existant)
        .map(p => ({
          boutique_id: boutiqueId, nom: p.nom, prix_achat: p.prix_achat, prix_vente: p.prix_vente,
          ...(avecGros ? { prix_demi_gros: p.prix_demi_gros, prix_gros: p.prix_gros, seuil_demi_gros: p.seuil_demi_gros, seuil_gros: p.seuil_gros, marque: p.marque } : {}),
          stock: p.stock, categorie: p.categorie, reference_oem: p.reference_oem, code_barre: p.code_barre,
        }));
      for (let i = 0; i < nouveaux.length; i += 200) {
        let lot = nouveaux.slice(i, i + 200);
        let { error } = await supabase.from("produits").insert(lot);
        if (error && estIndisponible(error) && avecGros) {
          // Base pas encore migrée : on réimporte sans les colonnes de gros
          ({ error } = await supabase.from("produits").insert(lot.map(sansGros)));
        }
        if (error) throw error;
      }
      // 2. Doublons en mode "mise à jour"
      let majFaites = 0;
      if (modeDoublon === "maj") {
        const doublons = prepares.filter(p => p.existant);
        for (const p of doublons) {
          const exist = produits.find(x => norm(x.nom) === norm(p.nom));
          if (!exist) continue;
          const patch = { stock: p.stock };
          if (p.prix_achat) patch.prix_achat = p.prix_achat;
          if (p.prix_vente) patch.prix_vente = p.prix_vente;
          if (p.prix_demi_gros) patch.prix_demi_gros = p.prix_demi_gros;
          if (p.prix_gros) patch.prix_gros = p.prix_gros;
          if (p.seuil_demi_gros) patch.seuil_demi_gros = p.seuil_demi_gros;
          if (p.seuil_gros) patch.seuil_gros = p.seuil_gros;
          if (p.marque) patch.marque = p.marque;
          if (p.categorie) patch.categorie = p.categorie;
          if (p.reference_oem) patch.reference_oem = p.reference_oem;
          if (p.code_barre) patch.code_barre = p.code_barre;
          let { error } = await supabase.from("produits").update(patch).eq("id", exist.id);
          if (error && estIndisponible(error)) {
            // Base pas encore migrée : on met à jour sans les colonnes de gros
            ({ error } = await supabase.from("produits").update(sansGros(patch)).eq("id", exist.id));
          }
          if (!error) majFaites++;
        }
      }
      setEnCours(false);
      const ignores = modeDoublon === "ignorer" ? nbDoublons : 0;
      onStatut(`✅ Import terminé : ${nouveaux.length} ajouté(s)${majFaites ? `, ${majFaites} mis à jour` : ""}${ignores ? `, ${ignores} doublon(s) ignoré(s)` : ""}.`);
      onRefresh();
      onClose();
    } catch (e) {
      setEnCours(false);
      setErreur(msgErreur(e, "L'import"));
    }
  };

  const aperçu = prepares.slice(0, 8);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 18, width: "100%", maxWidth: 560, margin: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: "bold", color: C.text }}>📥 Importer le stock (Excel / CSV)</div>
          <button onClick={onClose} aria-label="Fermer" style={{ width: 40, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        {/* ÉTAPE 1 : FICHIER */}
        {lignesBrutes.length === 0 ? (
          <div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
              Choisis ton fichier <b style={{ color: C.text }}>.xlsx</b>, <b style={{ color: C.text }}>.xls</b> ou <b style={{ color: C.text }}>.csv</b>.<br />
              La 1ʳᵉ ligne doit contenir les titres de colonnes (ex : Nom, Prix achat, Prix vente, Quantité).
            </div>
            <label style={{ display: "block", padding: "26px 16px", border: `2px dashed ${C.border}`, borderRadius: 10, textAlign: "center", cursor: "pointer", color: C.green, fontWeight: "bold" }}>
              📂 Choisir un fichier
              <input type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files[0] && lireFichier(e.target.files[0])} style={{ display: "none" }} />
            </label>
            <a href="/modele-import-stock.xlsx" download
              style={{ display: "block", textAlign: "center", marginTop: 12, fontSize: 12, color: C.blue, textDecoration: "none" }}>
              ⬇️ Pas de fichier ? Télécharge le modèle Excel à remplir
            </a>
          </div>
        ) : (
          <>
            {/* ÉTAPE 2 : MAPPAGE */}
            <div style={{ fontSize: 11, color: C.muted, fontWeight: "bold", marginBottom: 8 }}>1. ASSOCIE TES COLONNES ({lignesBrutes.length} lignes détectées)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {CHAMPS.map(ch => (
                <div key={ch.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 12, color: C.text }}>{ch.label}{ch.requis && <span style={{ color: C.red }}> *</span>}</span>
                  <select value={mapping[ch.id] ?? ""} onChange={e => setMapping(m => ({ ...m, [ch.id]: e.target.value === "" ? null : parseInt(e.target.value) }))}
                    style={{ flex: 1.3, padding: "6px 8px", background: C.surface2, border: `1px solid ${mapping[ch.id] == null && ch.requis ? C.red : C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }}>
                    <option value="">— ignorer —</option>
                    {entetes.map((h, i) => <option key={i} value={i}>{h || `Colonne ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* ÉTAPE 3 : APERÇU + DOUBLONS */}
            <div style={{ fontSize: 11, color: C.muted, fontWeight: "bold", marginBottom: 8 }}>2. APERÇU</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: C.green }}>✓ {nbNouveaux} nouveaux</span>
              {nbDoublons > 0 && <span style={{ color: C.yellow }}>⚠️ {nbDoublons} déjà existants</span>}
            </div>
            <div style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}`, padding: 8, marginBottom: 12, maxHeight: 180, overflowY: "auto" }}>
              {aperçu.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 12, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.existant && <span title="Déjà dans le catalogue" style={{ color: C.yellow }}>⚠️ </span>}{p.nom}
                  </span>
                  <span style={{ color: C.muted, marginLeft: 8 }}>{fmt(p.prix_vente)} · {p.stock} u</span>
                </div>
              ))}
              {prepares.length > aperçu.length && <div style={{ color: C.muted, fontSize: 11, padding: "4px 0", fontStyle: "italic" }}>… +{prepares.length - aperçu.length} autres</div>}
              {prepares.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Associe au moins la colonne « Nom ».</div>}
            </div>

            {/* DOUBLONS */}
            {nbDoublons > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: "bold", marginBottom: 6 }}>Pour les {nbDoublons} produits déjà présents :</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[{ id: "ignorer", l: "Ignorer" }, { id: "maj", l: "Mettre à jour (stock + prix)" }].map(o => (
                    <button key={o.id} onClick={() => setModeDoublon(o.id)}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer",
                        border: `1px solid ${modeDoublon === o.id ? C.green : C.border}`, background: modeDoublon === o.id ? C.green + "22" : "transparent", color: modeDoublon === o.id ? C.green : C.muted }}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {erreur && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>{erreur}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setLignesBrutes([]); setEntetes([]); setMapping({}); }}
                style={{ padding: "10px 14px", background: C.surface2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                ← Autre fichier
              </button>
              <button onClick={importer} disabled={enCours || mapping.nom == null || prepares.length === 0}
                style={{ flex: 1, padding: 10, background: enCours || mapping.nom == null ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 14, cursor: enCours ? "not-allowed" : "pointer" }}>
                {enCours ? "⏳ Import en cours..." : `✅ Importer ${prepares.length} produit(s)`}
              </button>
            </div>
          </>
        )}

        {erreur && lignesBrutes.length === 0 && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{erreur}</div>}
      </div>
    </div>
  );
}
