import React, { useState } from "react";
import { C } from "../theme";
import { supabase } from "../supabase";

// Sélecteur de boutique + vue globale + création
export default function BoutiqueSwitcher({ boutiques, active, vueGlobale, onSelect, onGlobale, proprietaireId, onCreated, estPatron = true }) {
  const [ouvert, setOuvert] = useState(false);
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [typeLieu, setTypeLieu] = useState("boutique");
  const [parentId, setParentId] = useState("");
  const [enCours, setEnCours] = useState(false);

  // Boutiques (parents possibles pour un entrepôt)
  const boutiquesMeres = boutiques.filter(b => b.type !== "entrepot");

  const creer = async () => {
    if (!nom.trim()) return;
    if (typeLieu === "entrepot" && !parentId) return; // un entrepôt doit avoir une boutique parent
    setEnCours(true);
    const { data } = await supabase.from("boutiques")
      .insert({
        proprietaire_id: proprietaireId,
        nom: nom.trim(),
        ville: ville.trim(),
        type: typeLieu,
        parent_id: typeLieu === "entrepot" ? parentId : null,
      })
      .select().single();
    setEnCours(false);
    setNom(""); setVille(""); setTypeLieu("boutique"); setParentId(""); setCreation(false); setOuvert(false);
    if (data) onCreated(data);
  };

  const titre = vueGlobale ? "🌍 Toutes les boutiques" : (active?.nom || "Ma Boutique");
  const soustitre = vueGlobale ? `${boutiques.length} boutique(s)` : (active?.ville || "");

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOuvert(o => !o)}
        style={{ background: "transparent", border: "none", cursor: "pointer", textAlign: "left", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: "bold", color: C.green }}>{titre} <span style={{ fontSize: 10, color: C.muted }}>▼</span></div>
          <div style={{ fontSize: 10, color: C.muted }}>{soustitre}</div>
        </div>
      </button>

      {ouvert && (
        <>
          {/* overlay pour fermer */}
          <div onClick={() => { setOuvert(false); setCreation(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 200 }} />
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 201,
            background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10,
            minWidth: 220, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", overflow: "hidden",
          }}>
            {/* Vue globale (patron seulement) */}
            {estPatron && boutiques.length > 1 && (
              <button onClick={() => { onGlobale(); setOuvert(false); }}
                style={{ ...itemStyle, color: vueGlobale ? C.green : C.text, fontWeight: vueGlobale ? "bold" : "normal" }}>
                🌍 Toutes les boutiques
              </button>
            )}

            {boutiquesMeres.map(b => {
              const depots = boutiques.filter(e => e.type === "entrepot" && e.parent_id === b.id);
              return (
                <div key={b.id}>
                  <button onClick={() => { onSelect(b); setOuvert(false); }}
                    style={{ ...itemStyle, color: !vueGlobale && active?.id === b.id ? C.green : C.text, fontWeight: !vueGlobale && active?.id === b.id ? "bold" : "normal" }}>
                    🏪 {b.nom}
                    {b.ville && <span style={{ color: C.muted, fontSize: 10, marginLeft: 6 }}>· {b.ville}</span>}
                  </button>
                  {depots.map(d => (
                    <button key={d.id} onClick={() => { onSelect(d); setOuvert(false); }}
                      style={{ ...itemStyle, paddingLeft: 28, fontSize: 12, color: !vueGlobale && active?.id === d.id ? C.green : C.muted, fontWeight: !vueGlobale && active?.id === d.id ? "bold" : "normal" }}>
                      🏬 {d.nom} <span style={{ color: C.blue, fontSize: 9 }}>(dépôt)</span>
                    </button>
                  ))}
                </div>
              );
            })}

            {estPatron && <div style={{ borderTop: `1px solid ${C.border}` }} />}

            {estPatron && (creation ? (
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {[{ id: "boutique", label: "🏪 Boutique" }, ...(boutiquesMeres.length > 0 ? [{ id: "entrepot", label: "🏬 Entrepôt" }] : [])].map(t => (
                    <button key={t.id} type="button" onClick={() => setTypeLieu(t.id)}
                      style={{ flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: "bold", cursor: "pointer",
                        border: `1px solid ${typeLieu === t.id ? C.green : C.border}`,
                        background: typeLieu === t.id ? C.green + "22" : "transparent",
                        color: typeLieu === t.id ? C.green : C.muted }}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {typeLieu === "entrepot" && (
                  <select value={parentId} onChange={e => setParentId(e.target.value)} style={inputStyle}>
                    <option value="">— Rattacher à quelle boutique ? —</option>
                    {boutiquesMeres.map(b => <option key={b.id} value={b.id}>🏪 {b.nom}</option>)}
                  </select>
                )}
                <input value={nom} onChange={e => setNom(e.target.value)} placeholder={typeLieu === "entrepot" ? "Nom de l'entrepôt" : "Nom de la boutique"} style={inputStyle} autoFocus />
                <input value={ville} onChange={e => setVille(e.target.value)} placeholder="Ville" style={inputStyle} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={creer} disabled={enCours || (typeLieu === "entrepot" && !parentId)}
                    style={{ flex: 1, padding: "6px 0", background: (typeLieu === "entrepot" && !parentId) ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 6, fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>
                    {enCours ? "..." : "Créer"}
                  </button>
                  <button onClick={() => setCreation(false)}
                    style={{ padding: "6px 10px", background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setCreation(true)} style={{ ...itemStyle, color: C.blue }}>
                ➕ Nouvelle boutique
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const itemStyle = {
  display: "block", width: "100%", textAlign: "left", padding: "10px 12px",
  background: "transparent", border: "none", cursor: "pointer", fontSize: 13,
};

const inputStyle = {
  padding: "7px 10px", background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 6, color: C.text, fontSize: 12, outline: "none",
};
