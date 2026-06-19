import React, { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt } from "../theme";

// Sélecteur de produit dynamique (autocomplete / combobox).
// Regroupe les produits par nom unique et affiche le stock TOTAL agrégé.
// Alimente Vente / Stock / Crédit via la même interface :
//   - value      : id du produit sélectionné ("" si aucun)
//   - onSelect(p): appelé avec l'objet produit choisi (ou null si effacé)
//   - autoriserNouveau : si true, propose "Nouveau produit" quand rien ne correspond
//   - onNouveau(nom)   : appelé quand l'utilisateur valide un nouveau nom
export default function ProduitSelect({
  produits, value, onSelect, placeholder = "Rechercher un produit...",
  autoriserNouveau = false, onNouveau,
}) {
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [surbrillance, setSurbrillance] = useState(0);
  const boxRef = useRef(null);

  // Regroupe par nom unique (insensible à la casse) avec stock total.
  // On garde le 1er produit comme représentant (mêmes prix dans une boutique).
  const groupes = useMemo(() => {
    const map = new Map();
    produits.forEach(p => {
      const cle = (p.nom || "").trim().toLowerCase();
      if (!cle) return;
      if (map.has(cle)) {
        const g = map.get(cle);
        g.stockTotal += p.stock || 0;
        g.ids.push(p.id);
      } else {
        map.set(cle, { ...p, stockTotal: p.stock || 0, ids: [p.id] });
      }
    });
    return [...map.values()].sort((a, b) => (a.nom || "").localeCompare(b.nom || ""));
  }, [produits]);

  // Libellé du produit actuellement sélectionné
  const selne = useMemo(() => groupes.find(g => g.ids.includes(value)) || produits.find(p => p.id === value), [groupes, produits, value]);

  const filtres = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return groupes.slice(0, 30);
    return groupes.filter(g =>
      (g.nom || "").toLowerCase().includes(s) ||
      (g.reference_oem || "").toLowerCase().includes(s) ||
      (g.compatibilite || "").toLowerCase().includes(s)
    ).slice(0, 30);
  }, [groupes, q]);

  // Ferme au clic extérieur
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOuvert(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const choisir = (g) => {
    onSelect(g);
    setQ("");
    setOuvert(false);
  };

  const effacer = () => { onSelect(null); setQ(""); setOuvert(true); };

  const onKey = (e) => {
    if (!ouvert) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSurbrillance(i => Math.min(i + 1, filtres.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSurbrillance(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (filtres[surbrillance]) choisir(filtres[surbrillance]);
      else if (autoriserNouveau && q.trim() && onNouveau) { onNouveau(q.trim()); setOuvert(false); }
    } else if (e.key === "Escape") setOuvert(false);
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      {/* Champ : si un produit est sélectionné, on l'affiche en "pilule" */}
      {value && selne ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, ...champStyle }}>
          <span style={{ flex: 1, color: C.text, fontSize: 13 }}>
            {selne.nom} <span style={{ color: C.muted, fontSize: 11 }}>· stock {selne.stockTotal ?? selne.stock ?? 0}</span>
          </span>
          <button type="button" onClick={effacer} title="Changer"
            style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      ) : (
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOuvert(true); setSurbrillance(0); }}
          onFocus={() => setOuvert(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          style={champStyle}
        />
      )}

      {ouvert && !value && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 240, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
          {filtres.length === 0 && !autoriserNouveau && (
            <div style={{ padding: "10px 12px", color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun produit trouvé.</div>
          )}
          {filtres.map((g, i) => {
            const rupture = (g.stockTotal || 0) <= 0;
            return (
              <div key={g.nom} onMouseEnter={() => setSurbrillance(i)} onMouseDown={(e) => { e.preventDefault(); choisir(g); }}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", cursor: "pointer",
                  background: i === surbrillance ? C.surface2 : "transparent", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.nom}</div>
                  {g.reference_oem && <div style={{ color: C.blue, fontSize: 10 }}>réf. {g.reference_oem}</div>}
                </div>
                <span style={{ flexShrink: 0, marginLeft: 8, fontSize: 11, fontWeight: "bold",
                  color: rupture ? C.red : C.green }}>
                  {rupture ? "rupture" : `stock ${g.stockTotal}`}
                </span>
              </div>
            );
          })}
          {autoriserNouveau && q.trim() && !filtres.some(g => (g.nom || "").toLowerCase() === q.trim().toLowerCase()) && (
            <div onMouseDown={(e) => { e.preventDefault(); onNouveau && onNouveau(q.trim()); setOuvert(false); }}
              style={{ padding: "10px 12px", cursor: "pointer", color: C.green, fontSize: 13, fontWeight: "bold" }}>
              ➕ Nouveau produit : « {q.trim()} »
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const champStyle = {
  width: "100%", padding: "9px 12px", background: "var(--surface2)", border: "1px solid var(--border)",
  borderRadius: 8, color: "var(--text)", fontSize: 13, boxSizing: "border-box", outline: "none",
};
