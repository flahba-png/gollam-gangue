import React, { useState } from "react";
import { C, fmt, heure, todayISO } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";

const MOTIFS = [
  { id: "comptage", label: "Recomptage" },
  { id: "casse", label: "Casse" },
  { id: "vol", label: "Vol / perte" },
  { id: "erreur", label: "Erreur de saisie" },
];

export default function Inventaire({ produits, boutiqueActive, monNom, onRefresh, onStatut }) {
  const [recherche, setRecherche] = useState("");
  const [comptes, setComptes] = useState({}); // id -> compté
  const [motifs, setMotifs] = useState({});   // id -> motif
  const [enCours, setEnCours] = useState(false);

  const filtres = produits.filter(p => !recherche || p.nom?.toLowerCase().includes(recherche.toLowerCase()));

  // Lignes effectivement modifiées
  const ajustements = produits
    .map(p => ({ p, compte: comptes[p.id] }))
    .filter(({ p, compte }) => compte !== undefined && compte !== "" && (parseInt(compte) || 0) !== (p.stock || 0))
    .map(({ p, compte }) => ({ p, compte: parseInt(compte) || 0, ecart: (parseInt(compte) || 0) - (p.stock || 0), motif: motifs[p.id] || "comptage" }));

  const valeurEcart = ajustements.reduce((s, a) => s + a.ecart * ((a.p.prix_achat || 0) + (a.p.frais_unitaire || 0)), 0);

  const valider = async () => {
    if (ajustements.length === 0) { onStatut("⚠️ Aucun écart à enregistrer."); return; }
    setEnCours(true);
    for (const a of ajustements) {
      await supabase.from("produits").update({ stock: a.compte }).eq("id", a.p.id);
      const motifLabel = MOTIFS.find(m => m.id === a.motif)?.label || a.motif;
      await supabase.from("historique").insert({
        boutique_id: boutiqueActive.id, heure: heure(), date_iso: todayISO(),
        texte: `📋 Inventaire ${a.p.nom} : ${a.p.stock || 0} → ${a.compte} (${a.ecart > 0 ? "+" : ""}${a.ecart}, ${motifLabel})`,
        type: "inventaire", montant: 0, benefice_etabli: 0, vendeur_nom: monNom,
        details_facture: { article: a.p.nom, ecart: a.ecart, motif: motifLabel, type: "Inventaire" },
      });
    }
    setEnCours(false);
    setComptes({}); setMotifs({});
    onStatut(`✅ Inventaire validé : ${ajustements.length} ajustement(s).`);
    onRefresh();
  };

  return (
    <div style={{ padding: "0 12px 12px" }}>
      <div style={{ marginBottom: 12 }}>
        <input type="text" placeholder="🔍 Filtrer un produit..." value={recherche} onChange={e => setRecherche(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, boxSizing: "border-box" }} />
      </div>

      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>📋 {t("inventaire_physique").toUpperCase()}</div>
        {filtres.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun produit.</div>}
        {filtres.map(p => {
          const compte = comptes[p.id];
          const ecart = compte !== undefined && compte !== "" ? (parseInt(compte) || 0) - (p.stock || 0) : null;
          return (
            <div key={p.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: C.text, fontSize: 13 }}>{p.nom}</div>
                  <div style={{ color: C.muted, fontSize: 10 }}>{t("theorique")} : {p.stock || 0} u</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {ecart !== null && ecart !== 0 && (
                    <span style={{ color: ecart > 0 ? C.green : C.red, fontSize: 11, fontWeight: "bold" }}>{ecart > 0 ? "+" : ""}{ecart}</span>
                  )}
                  <input type="number" inputMode="numeric" placeholder="compté" value={compte ?? ""}
                    onChange={e => setComptes(prev => ({ ...prev, [p.id]: e.target.value }))}
                    style={{ width: 64, padding: "6px", background: C.surface2, border: `1px solid ${ecart ? (ecart > 0 ? C.green : C.red) : C.border}`, borderRadius: 6, color: C.text, fontSize: 12, textAlign: "center" }} />
                </div>
              </div>
              {ecart !== null && ecart !== 0 && (
                <select value={motifs[p.id] || "comptage"} onChange={e => setMotifs(prev => ({ ...prev, [p.id]: e.target.value }))}
                  style={{ width: "100%", marginTop: 6, padding: "6px 8px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 11 }}>
                  {MOTIFS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {/* RÉSUMÉ + VALIDATION */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${ajustements.length ? C.yellow : C.border}55`, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: C.muted }}>Ajustements</span>
          <span style={{ color: C.text, fontWeight: "bold" }}>{ajustements.length}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 10 }}>
          <span style={{ color: C.muted }}>Impact valeur stock</span>
          <span style={{ color: valeurEcart < 0 ? C.red : C.green, fontWeight: "bold" }}>{valeurEcart > 0 ? "+" : ""}{fmt(valeurEcart)} F</span>
        </div>
        <button onClick={valider} disabled={enCours || ajustements.length === 0}
          style={{ width: "100%", padding: 12, background: (enCours || ajustements.length === 0) ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 14, cursor: "pointer" }}>
          {enCours ? "..." : "✅ Valider l'inventaire"}
        </button>
      </div>
    </div>
  );
}
