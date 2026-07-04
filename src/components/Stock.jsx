import React, { useState, useMemo, lazy, Suspense } from "react";
import { C, fmt } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";
import Scanner from "./Scanner";
const ImportStock = lazy(() => import("./ImportStock"));

const TRIS = [
  { id: "stock", label: "Stock ↑" },
  { id: "stock_desc", label: "Stock ↓" },
  { id: "az", label: "A → Z" },
  { id: "za", label: "Z → A" },
  { id: "prix_desc", label: "Prix ↓" },
  { id: "prix", label: "Prix ↑" },
];

export default function Stock({ produits, boutiqueId, onRefresh, fournisseurs = [], onTransfer, voirPrixAchat = true, peutModifier = true, onAudit, onStatut }) {
  const [recherche, setRecherche] = useState("");
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [sauvegarde, setSauvegarde] = useState(false);
  const [scanOuvert, setScanOuvert] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const [tri, setTri] = useState("stock");
  const [categorie, setCategorie] = useState("toutes");

  // Catégories existantes (pour les boutons de filtre)
  const categories = useMemo(() => {
    const set = new Set();
    produits.forEach(p => { if (p.categorie) set.add(p.categorie); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [produits]);

  const produitsFiltres = useMemo(() => {
    const q = recherche.toLowerCase();
    const liste = produits.filter(p => {
      const okCat = categorie === "toutes"
        || (categorie === "_sans" ? !p.categorie : p.categorie === categorie);
      if (!okCat) return false;
      if (!recherche) return true;
      return p.nom?.toLowerCase().includes(q)
        || p.reference_oem?.toLowerCase().includes(q)
        || p.compatibilite?.toLowerCase().includes(q)
        || p.categorie?.toLowerCase().includes(q)
        || p.code_barre?.toLowerCase().includes(q);
    });
    const cmp = {
      stock: (a, b) => (a.stock || 0) - (b.stock || 0),
      stock_desc: (a, b) => (b.stock || 0) - (a.stock || 0),
      az: (a, b) => (a.nom || "").localeCompare(b.nom || ""),
      za: (a, b) => (b.nom || "").localeCompare(a.nom || ""),
      prix: (a, b) => (a.prix_vente || 0) - (b.prix_vente || 0),
      prix_desc: (a, b) => (b.prix_vente || 0) - (a.prix_vente || 0),
    }[tri] || (() => 0);
    return [...liste].sort(cmp);
  }, [produits, recherche, categorie, tri]);

  const startEdit = (p) => {
    setEditId(p.id);
    setEditData({ nom: p.nom, categorie: p.categorie || "", prixAchat: p.prix_achat, prixVente: p.prix_vente, stock: p.stock, seuil: p.seuil_alerte ?? 2, fournisseurId: p.fournisseur_id || "", codeBarre: p.code_barre || "", refOem: p.reference_oem || "", compat: p.compatibilite || "", frais: p.frais_unitaire || 0, carton: p.unites_par_carton || 1,
      prixDemiGros: p.prix_demi_gros || "", prixGros: p.prix_gros || "",
      seuilDemiGros: p.seuil_demi_gros ?? 3, seuilGros: p.seuil_gros ?? ((p.unites_par_carton || 0) > 1 ? p.unites_par_carton : "") });
  };

  const saveEdit = async () => {
    setSauvegarde(true);
    const ancien = produits.find(p => p.id === editId) || null;
    const nouveau = {
      nom: editData.nom,
      categorie: (editData.categorie || "").trim() || null,
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
      prix_demi_gros: parseInt(editData.prixDemiGros) || 0,
      prix_gros: parseInt(editData.prixGros) || 0,
      seuil_demi_gros: parseInt(editData.seuilDemiGros) || 0,
      seuil_gros: parseInt(editData.seuilGros) || 0,
    };
    await supabase.from("produits").update(nouveau).eq("id", editId);
    if (onAudit) await onAudit({ table: "produits", cibleId: editId, action: "modification", ancien, nouveau });
    setEditId(null);
    setSauvegarde(false);
    onRefresh();
  };

  const supprimerProduit = async (id) => {
    if (!confirm("Supprimer ce produit du catalogue ?")) return;
    const ancien = produits.find(p => p.id === id) || null;
    await supabase.from("produits").delete().eq("id", id);
    if (onAudit) await onAudit({ table: "produits", cibleId: id, action: "suppression", ancien });
    onRefresh();
  };

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {scanOuvert && <Scanner onScan={(code) => { setScanOuvert(false); setEditData(d => ({ ...d, codeBarre: code })); }} onClose={() => setScanOuvert(false)} />}
      {importOuvert && (
        <Suspense fallback={<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>⏳ Chargement…</div>}>
          <ImportStock produits={produits} boutiqueId={boutiqueId} onRefresh={onRefresh}
            onStatut={onStatut || (() => {})} onClose={() => setImportOuvert(false)} />
        </Suspense>
      )}

      {peutModifier && (
        <button onClick={() => setImportOuvert(true)}
          style={{ width: "100%", padding: 11, marginBottom: 10, background: C.green + "18", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
          📥 Importer depuis Excel / CSV
        </button>
      )}

      {onTransfer && (
        <button onClick={onTransfer}
          style={{ width: "100%", padding: 11, marginBottom: 10, background: C.blue + "18", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
          🔄 {t("transferer_stock")}
        </button>
      )}

      <div style={{ marginBottom: 8 }}>
        <input type="text" placeholder={`🔍 ${t("rechercher_produit")}`}
          value={recherche} onChange={e => setRecherche(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, boxSizing: "border-box" }} />
      </div>

      {/* TRI */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: C.muted, alignSelf: "center", flexShrink: 0 }}>Trier :</span>
        {TRIS.map(o => (
          <button key={o.id} onClick={() => setTri(o.id)}
            style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 14, fontSize: 11, fontWeight: "bold", cursor: "pointer", whiteSpace: "nowrap",
              border: `1px solid ${tri === o.id ? C.green : C.border}`, background: tri === o.id ? C.green + "22" : "transparent", color: tri === o.id ? C.green : C.muted }}>
            {o.label}
          </button>
        ))}
      </div>

      {/* FILTRE CATÉGORIE */}
      {categories.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 12 }}>
          {[{ id: "toutes", l: "Toutes" }, ...categories.map(c => ({ id: c, l: c })), { id: "_sans", l: "Sans catégorie" }].map(o => (
            <button key={o.id} onClick={() => setCategorie(o.id)}
              style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 14, fontSize: 11, fontWeight: "bold", cursor: "pointer", whiteSpace: "nowrap",
                border: `1px solid ${categorie === o.id ? C.blue : C.border}`, background: categorie === o.id ? C.blue + "22" : "transparent", color: categorie === o.id ? C.blue : C.muted }}>
              {o.l}
            </button>
          ))}
        </div>
      )}

      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11 }}>📦 CATALOGUE ({produitsFiltres.length} articles)</div>
          <div style={{ color: C.muted, fontSize: 10 }}>
            Valeur : {fmt(produits.reduce((s, p) => s + ((p.prix_vente || 0) * (p.stock || 0)), 0))}
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
                <input value={editData.categorie} onChange={e => setEditData(d => ({ ...d, categorie: e.target.value }))}
                  style={inputStyle} placeholder="Catégorie (ex: Filtres, Freinage...)" list="cats-stock" />
                <datalist id="cats-stock">{categories.map(c => <option key={c} value={c} />)}</datalist>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  <input type="number" value={editData.prixAchat} onChange={e => setEditData(d => ({ ...d, prixAchat: e.target.value }))}
                    style={inputStyle} placeholder="Achat" />
                  <input type="number" value={editData.prixVente} onChange={e => setEditData(d => ({ ...d, prixVente: e.target.value }))}
                    style={inputStyle} placeholder="Vente" />
                  <input type="number" value={editData.stock} onChange={e => setEditData(d => ({ ...d, stock: e.target.value }))}
                    style={inputStyle} placeholder="Stock" />
                </div>
                {/* Tarifs gros (facultatif) */}
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
                  <div style={{ fontSize: 9, color: C.muted, fontWeight: "bold", letterSpacing: 0.5, marginBottom: 6 }}>💰 TARIFS GROS (facultatif)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 6, marginBottom: 6 }}>
                    <input type="number" value={editData.prixDemiGros} onChange={e => setEditData(d => ({ ...d, prixDemiGros: e.target.value }))}
                      style={inputStyle} placeholder="Prix demi-gros" />
                    <input type="number" value={editData.seuilDemiGros} onChange={e => setEditData(d => ({ ...d, seuilDemiGros: e.target.value }))}
                      style={inputStyle} placeholder="dès … u" title="Quantité à partir de laquelle le prix demi-gros s'applique" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 6 }}>
                    <input type="number" value={editData.prixGros} onChange={e => setEditData(d => ({ ...d, prixGros: e.target.value }))}
                      style={inputStyle} placeholder="Prix gros" />
                    <input type="number" value={editData.seuilGros} onChange={e => setEditData(d => ({ ...d, seuilGros: e.target.value }))}
                      style={inputStyle} placeholder="dès … u" title="Quantité à partir de laquelle le prix gros s'applique (souvent le carton)" />
                  </div>
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
                  <div style={{ fontWeight: "bold", color: C.text, fontSize: 13 }}>
                    {p.nom}
                    {p.categorie && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: "bold", color: C.blue, background: C.blue + "18", border: `1px solid ${C.blue}33`, borderRadius: 8, padding: "1px 6px" }}>{p.categorie}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {voirPrixAchat && <>Achat : {fmt(p.prix_achat)} · </>}Vente : {fmt(p.prix_vente)}
                  </div>
                  {((p.prix_demi_gros || 0) > 0 || (p.prix_gros || 0) > 0) && (
                    <div style={{ fontSize: 10, color: C.green, marginTop: 1 }}>
                      {(p.prix_demi_gros || 0) > 0 && <>½gros {fmt(p.prix_demi_gros)} dès {p.seuil_demi_gros || 3}u</>}
                      {(p.prix_demi_gros || 0) > 0 && (p.prix_gros || 0) > 0 && " · "}
                      {(p.prix_gros || 0) > 0 && <>gros {fmt(p.prix_gros)} dès {p.seuil_gros || "?"}u</>}
                    </div>
                  )}
                  {voirPrixAchat && (
                    <div style={{ fontSize: 10, color: C.yellow, marginTop: 1 }}>
                      Marge nette : +{fmt((p.prix_vente || 0) - (p.prix_achat || 0) - (p.frais_unitaire || 0))}/u
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
                    <button onClick={() => startEdit(p)} aria-label="Modifier"
                      style={{ background: C.blue + "22", color: C.blue, border: `1px solid ${C.blue}44`, padding: "8px 12px", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
                      ✏️
                    </button>
                    <button onClick={() => supprimerProduit(p.id)} aria-label="Supprimer"
                      style={{ background: C.red + "22", color: C.red, border: `1px solid ${C.red}44`, padding: "8px 12px", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
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
