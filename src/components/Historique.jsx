import React, { useState } from "react";
import { C, fmt } from "../theme";
import { supabase } from "../supabase";

const exporterCSV = (historique) => {
  const lignes = [
    ["Heure", "Type", "Description", "Montant (F)", "Bénéfice (F)", "Date", "Saisi par", "Argent remis à"].join(";"),
    ...historique.map(h => [
      h.heure, h.type, `"${h.texte}"`, h.montant || 0, h.benefice_etabli || 0, h.date_iso || "",
      `"${h.vendeur_nom || ""}"`, `"${h.details_facture?.beneficiaire || ""}"`
    ].join(";"))
  ];
  const blob = new Blob(["﻿" + lignes.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().split("T")[0];
  a.href = url; a.download = `gangue_export_${today}.csv`; a.click();
  URL.revokeObjectURL(url);
};

export default function Historique({ historique, produits, boutiqueId, onRefresh, onImprimer, onWhatsApp, onRetour, voirBenefice = true, peutRetourner = true, peutModifier = false, onSupprimer }) {
  const [filtreDate, setFiltreDate] = useState("");
  const [filtreType, setFiltreType] = useState("tous");
  const [showReset, setShowReset] = useState(false);
  const [retourId, setRetourId] = useState(null);   // vente en cours de retour
  const [retourQtes, setRetourQtes] = useState({});  // qte à retourner par ligne
  const [supprId, setSupprId] = useState(null);      // mouvement en confirmation de suppression

  const ouvrirRetour = (h) => {
    setRetourId(h.id);
    const lignes = h.details_facture?.lignes || [];
    const init = {};
    lignes.forEach((l, i) => { init[i] = l.qte; });
    setRetourQtes(init);
  };

  const validerRetour = (h) => {
    const lignes = (h.details_facture?.lignes || []).map((l, i) => ({ nom: l.nom, pu: l.pu, qte: Math.min(parseInt(retourQtes[i]) || 0, l.qte) }));
    onRetour(h, lignes);
    setRetourId(null); setRetourQtes({});
  };

  const histoFiltre = historique.filter(h => {
    const okDate = !filtreDate || h.date_iso === filtreDate;
    const okType = filtreType === "tous" || h.type === filtreType;
    return okDate && okType;
  });

  const resetDonnees = async () => {
    await supabase.from("historique").delete().eq("boutique_id", boutiqueId);
    setShowReset(false);
    onRefresh();
  };

  return (
    <div style={{ padding: "0 12px 12px" }}>
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>FILTRES</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="date" value={filtreDate} onChange={e => setFiltreDate(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }} />
          <select value={filtreType} onChange={e => setFiltreType(e.target.value)}
            style={{ flex: 1, padding: "6px 10px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }}>
            <option value="tous">Tout</option>
            <option value="vente">Ventes</option>
            <option value="depense">Dépenses</option>
            <option value="ajout">Ajouts stock</option>
            <option value="transfert">Transferts</option>
            <option value="retour">Retours</option>
            <option value="inventaire">Inventaire</option>
          </select>
          {(filtreDate || filtreType !== "tous") && (
            <button onClick={() => { setFiltreDate(""); setFiltreType("tous"); }}
              style={{ padding: "6px 10px", background: C.red + "22", color: C.red, border: `1px solid ${C.red}44`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
              ✕ Reset
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { label: "VENTES", value: histoFiltre.filter(h => h.type === "vente").reduce((s, h) => s + (h.montant || 0), 0), color: C.green },
          { label: "DÉPENSES", value: histoFiltre.filter(h => h.type === "depense").reduce((s, h) => s + (h.montant || 0), 0), color: C.red },
          { label: "OPÉRATIONS", value: histoFiltre.length, color: C.text, isCnt: true },
        ].map(({ label, value, color, isCnt }) => (
          <div key={label} style={{ background: C.surface, padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, textAlign: "center" }}>
            <div style={{ fontSize: 9, color: C.muted }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: "bold", color }}>{isCnt ? value : `${fmt(value)}`}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11 }}>FLUX ({histoFiltre.length})</div>
          <button onClick={() => exporterCSV(histoFiltre)}
            style={{ background: C.blue + "22", color: C.blue, border: `1px solid ${C.blue}44`, padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
            ⬇️ Export CSV
          </button>
        </div>
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          {histoFiltre.map(h => {
            const peutRetour = h.type === "vente" && Array.isArray(h.details_facture?.lignes) && h.details_facture.lignes.length > 0;
            return (
            <div key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", fontSize: 12 }}>
                <div>
                  <div style={{ color: h.type === "retour" ? C.red : C.text }}>{h.texte}</div>
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                    {h.heure} · {h.date_iso}
                    {(h.details_facture?.beneficiaire || h.vendeur_nom) && (
                      <span style={{ color: h.type === "depense" ? C.red : C.muted, fontWeight: h.type === "depense" ? "bold" : "normal" }}>
                        {" · 👤 "}{h.details_facture?.beneficiaire || h.vendeur_nom}
                        {h.details_facture?.beneficiaire && h.vendeur_nom && <span style={{ color: C.muted, fontWeight: "normal" }}> (saisi par {h.vendeur_nom})</span>}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {h.type === "transfert" ? (
                    <span style={{ background: C.blue + "22", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>
                      Mouvement
                    </span>
                  ) : h.type === "inventaire" ? (
                    <span style={{ background: C.purple + "22", color: C.purple, border: `1px solid ${C.purple}44`, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>
                      Inventaire
                    </span>
                  ) : (
                    <span style={{ color: h.type === "vente" ? C.green : (h.type === "depense" || h.type === "retour") ? C.red : C.text, fontWeight: "bold", fontSize: 13 }}>
                      {(h.type === "depense" || h.type === "retour") ? "-" : "+"}{fmt(h.montant)}
                    </span>
                  )}
                  {voirBenefice && h.type === "vente" && h.benefice_etabli > 0 && (
                    <span style={{ color: C.yellow, fontSize: 10 }} title="marge">+{fmt(h.benefice_etabli)}</span>
                  )}
                  {h.type === "vente" && (
                    <>
                      <button onClick={() => onWhatsApp(h)} style={{ background: "#25D36622", color: "#25D366", border: "1px solid #25D36644", padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>💬</button>
                      <button onClick={() => onImprimer(h)} style={{ background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>🖨️</button>
                      {peutRetour && peutRetourner && onRetour && (
                        <button onClick={() => retourId === h.id ? setRetourId(null) : ouvrirRetour(h)} style={{ background: C.red + "22", color: C.red, border: `1px solid ${C.red}44`, padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>↩️</button>
                      )}
                    </>
                  )}
                  {peutModifier && onSupprimer && (
                    <button onClick={() => setSupprId(supprId === h.id ? null : h.id)} title="Supprimer ce mouvement"
                      style={{ background: C.red + "18", color: C.red, border: `1px solid ${C.red}33`, padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>🗑️</button>
                  )}
                </div>
              </div>

              {/* CONFIRMATION DE SUPPRESSION */}
              {supprId === h.id && peutModifier && onSupprimer && (
                <div style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.red}44`, padding: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: C.red, marginBottom: 8 }}>
                    ⚠️ Supprimer ce mouvement ? Le stock sera réajusté. L'action est tracée (audit).
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { onSupprimer(h); setSupprId(null); }}
                      style={{ flex: 1, padding: "7px 0", background: C.red, color: "#fff", border: "none", borderRadius: 6, fontWeight: "bold", fontSize: 12, cursor: "pointer" }}>Confirmer la suppression</button>
                    <button onClick={() => setSupprId(null)}
                      style={{ padding: "7px 14px", background: C.surface, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Annuler</button>
                  </div>
                </div>
              )}

              {/* PANNEAU DE RETOUR */}
              {retourId === h.id && peutRetour && peutRetourner && (
                <div style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.red}44`, padding: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: "bold", marginBottom: 6 }}>↩️ QUANTITÉS À RETOURNER</div>
                  {h.details_facture.lignes.map((l, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                      <span style={{ color: C.text, fontSize: 12 }}>{l.nom} <span style={{ color: C.muted, fontSize: 10 }}>(vendu {l.qte})</span></span>
                      <input type="number" min="0" max={l.qte} value={retourQtes[i] ?? l.qte}
                        onChange={e => setRetourQtes(prev => ({ ...prev, [i]: e.target.value }))}
                        style={{ width: 50, padding: "4px 6px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, textAlign: "center" }} />
                    </div>
                  ))}
                  <button onClick={() => validerRetour(h)}
                    style={{ width: "100%", marginTop: 8, padding: "8px 0", background: C.red, color: "#fff", border: "none", borderRadius: 6, fontWeight: "bold", fontSize: 12, cursor: "pointer" }}>
                    Valider le retour (rembourse + réintègre le stock)
                  </button>
                </div>
              )}
            </div>
          );})}
          {histoFiltre.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", padding: "10px 0" }}>Aucune opération pour ce filtre.</div>}
        </div>
      </div>

      <div style={{ textAlign: "center" }}>
        {!showReset ? (
          <button onClick={() => setShowReset(true)}
            style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
            🗑️ Effacer tout l'historique
          </button>
        ) : (
          <div style={{ background: C.surface, padding: 12, borderRadius: 8, border: `1px solid ${C.red}` }}>
            <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>⚠️ Confirmer la suppression de tout l'historique ?</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={resetDonnees} style={{ background: C.red, color: "#fff", border: "none", padding: "6px 16px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Confirmer</button>
              <button onClick={() => setShowReset(false)} style={{ background: C.surface2, color: C.text, border: `1px solid ${C.border}`, padding: "6px 16px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
