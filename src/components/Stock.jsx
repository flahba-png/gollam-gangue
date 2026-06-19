import React, { useState } from "react";
import { C, fmt } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";
import Scanner from "./Scanner";

export default function Stock({ produits, boutiqueId, onRefresh, fournisseurs = [], onTransfer, voirPrixAchat = true, peutModifier = true }) {
  const [recherche, setRecherche] = useState("");
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [sauvegarde, setSauvegarde] = useState(false);
  const [scanOuvert, setScanOuvert] = useState(false);

  const produitsFiltres = produits.filter(p => {
    if (!recherche) return true;
    const q = recherche.toLowerCase();
    return p.nom?.toLowerCase().includes(q)
      || p.reference_oem?.toLowerCase().includes(q)
      || p.compatibilite?.toLowerCase().includes(q)
      || p.code_barre?.toLowerCase().includes(q);
  }).sort((a, b) => (a.stock || 0) - (b.stock || 0));

  const startEdit = (p) => {
    setEditId(p.id);
    setEditData({ nom: p.nom, prixAchat: p.prix_achat, prixVente: p.prix_vente, stock: p.stock, seuil: p.seuil_alerte ?? 2, fournisseurId: p.fournisseur_id || "", codeBarre: p.code_barre || "", refOem: p.reference_oem || "", compat: p.compatibilite || "", frais: p.frais_unitaire || 0, carton: p.unites_par_carton || 1 });
  };

  const saveEdit = async () => {
    setSauvegarde(true);
    await supabase.from("produits").update({
      nom: editData.nom,
      prix_achat: parseInt(editData.prixAchat) || 0,
      prix_vente: parseInt(editData.prixVente) || 0,
      stock: parseInt(editData.stock) || 0,
      seuil_alerte: parseInt(editData.seuil) || 0,
      fournisseur_id: editData.fournisseurId || null,
      code_barre: editData.codeBarre || null,
      reference_oem: editData.refOem || null,
      compatibilite: editData.compat || null,
      frais_unitaire: parseInt(editData.frais) || 0,
      unites_par_carton: Math.max(1, parseInt(editData.carton) || 1),
    }).eq("id", editId);
    setEditId(null);
    setSauvegarde(false);
    onRefresh();
  };

  const supprimerProduit = async (id) => {
    if (!confirm("Supprimer ce produit du catalogue ?")) return;
    await supabase.from("produits").delete().eq("id", id);
    onRefresh();
  };

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {scanOuvert && <Scanner onScan={(code) => { setScanOuvert(false); setEditData(d => ({ ...d, codeBarre: code })); }} onClose={() => setScanOuvert(false)} />}

      {onTransfer && (
        <button onClick={onTransfer}
          style={{ width: "100%", padding: 11, marginBottom: 10, background: C.blue + "18", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
          🔄 {t("transferer_stock")}
        </button>
      )}

      <div style={{ marginBottom: 12 }}>
        <input type="text" placeholder={`🔍 ${t("rechercher_produit")}`}
          value={recherche} onChange={e => setRecherche(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, boxSizing: "border-box" }} />
      </div>

      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11 }}>📦 CATALOGUE ({produitsFiltres.length} articles)</div>
          <div style={{ color: C.muted, fontSize: 10 }}>
            Valeur : {fmt(produits.reduce((s, p) => s + ((p.prix_vente || 0) * (p.stock || 0)), 0))} F
          </div>
        </div>

        {produitsFiltres.length === 0 && (
          <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun produit trouvé.</div>
        )}

        {produitsFiltres.map(p => (
          <div key={p.id} style={{ padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
            {editId === p.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={editData.nom} onChange={e => setEditData(d => ({ ...d, nom: e.target.value }))}
                  style={inputStyle} placeholder="Nom" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <input type="number" value={editData.prixAchat} onChange={e => setEditData(d => ({ ...d, prixAchat: e.target.value }))}
                    style={inputStyle} placeholder="Achat" />
                  <input type="number" value={editData.prixVente} onChange={e => setEditData(d => ({ ...d, prixVente: e.target.value }))}
                    style={inputStyle} placeholder="Vente" />
                  <input type="number" value={editData.stock} onChange={e => setEditData(d => ({ ...d, stock: e.target.value }))}
                    style={inputStyle} placeholder="Stock" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 6 }}>
                  <input type="number" value={editData.seuil} onChange={e => setEditData(d => ({ ...d, seuil: e.target.value }))}
                    style={inputStyle} placeholder="Seuil alerte" title="Alerte de réassort quand le stock atteint ce niveau" />
                  <select value={editData.fournisseurId} onChange={e => setEditData(d => ({ ...d, fournisseurId: e.target.value }))}
                    style={inputStyle}>
                    <option value="">— Fournisseur —</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={editData.codeBarre} onChange={e => setEditData(d => ({ ...d, codeBarre: e.target.value }))}
                    style={{ ...inputStyle, flex: 1 }} placeholder="Code-barres" />
                  <button type="button" onClick={() => setScanOuvert(true)} title="Scanner le code-barres"
                    style={{ flexShrink: 0, width: 42, background: C.blue + "22", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 6, fontSize: 16, cursor: "pointer" }}>
                    📷
                  </button>
                </div>
                <input value={editData.refOem} onChange={e => setEditData(d => ({ ...d, refOem: e.target.value }))}
                  style={inputStyle} placeholder="Référence OEM (ex: 90915-YZZD4)" />
                <input value={editData.compat} onChange={e => setEditData(d => ({ ...d, compat: e.target.value }))}
                  style={inputStyle} placeholder="Compatibilité (ex: Toyota Hilux 2010-2015)" />
                <input type="number" value={editData.frais} onChange={e => setEditData(d => ({ ...d, frais: e.target.value }))}
                  style={inputStyle} placeholder="Frais/unité (transport, douane)" />
                <input type="number" min="1" value={editData.carton} onChange={e => setEditData(d => ({ ...d, carton: e.target.value }))}
                  style={inputStyle} placeholder="Pièces par carton (1 = aucun)" />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={saveEdit} disabled={sauvegarde}
                    style={{ flex: 1, padding: "6px 0", background: C.green, color: C.bg, border: "none", borderRadius: 6, fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>
                    {sauvegarde ? "..." : "✅ Sauvegarder"}
                  </button>
                  <button onClick={() => setEditId(null)}
                    style={{ padding: "6px 12px", background: C.surface2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: "bold", color: C.text, fontSize: 13 }}>{p.nom}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {voirPrixAchat && <>Achat : {fmt(p.prix_achat)} F · </>}Vente : {fmt(p.prix_vente)} F
                  </div>
                  {voirPrixAchat && (
                    <div style={{ fontSize: 10, color: C.yellow, marginTop: 1 }}>
                      Marge nette : +{fmt((p.prix_vente || 0) - (p.prix_achat || 0) - (p.frais_unitaire || 0))} F/u
                      {p.frais_unitaire > 0 && <span style={{ color: C.muted }}> (frais {fmt(p.frais_unitaire)})</span>}
                    </div>
                  )}
                  {p.reference_oem && <div style={{ fontSize: 10, color: C.blue, marginTop: 1 }}>réf. {p.reference_oem}</div>}
                  {p.compatibilite && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>🚗 {p.compatibilite}</div>}
                  {p.unites_par_carton > 1 && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>📦 {p.unites_par_carton} pièces/carton</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span style={{
                    background: ((p.stock || 0) <= 2 ? C.red : (p.stock || 0) <= 5 ? C.yellow : C.green) + "22",
                    color: (p.stock || 0) <= 2 ? C.red : (p.stock || 0) <= 5 ? C.yellow : C.green,
                    border: `1px solid ${((p.stock || 0) <= 2 ? C.red : (p.stock || 0) <= 5 ? C.yellow : C.green)}55`,
                    borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: "bold"
                  }}>
                    {p.stock || 0} u
                  </span>
                  {peutModifier && <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => startEdit(p)}
                      style={{ background: C.blue + "22", color: C.blue, border: `1px solid ${C.blue}44`, padding: "2px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>
                      ✏️
                    </button>
                    <button onClick={() => supprimerProduit(p.id)}
                      style={{ background: C.red + "22", color: C.red, border: `1px solid ${C.red}44`, padding: "2px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>
                      🗑️
                    </button>
                  </div>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle = {
  padding: "8px 10px",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  fontSize: 12,
  width: "100%",
  boxSizing: "border-box"
};
