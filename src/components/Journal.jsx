import React, { useState, useEffect, useCallback } from "react";
import { C, fmt } from "../theme";
import { supabase } from "../supabase";

// Journal des actions sensibles (lecture réservée au propriétaire via RLS).
// Fusionne journal_audit (retours) + logs_modifications (modif/suppression).
export default function Journal({ boutiqueId }) {
  const [items, setItems] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState("tous"); // tous | suppression | modification | retour

  const charger = useCallback(async () => {
    if (!boutiqueId) { setItems([]); setChargement(false); return; }
    setChargement(true);
    const [{ data: audit }, { data: mods }] = await Promise.all([
      supabase.from("journal_audit").select("*").eq("boutique_id", boutiqueId).order("created_at", { ascending: false }).limit(200),
      supabase.from("logs_modifications").select("*").eq("boutique_id", boutiqueId).order("created_at", { ascending: false }).limit(200),
    ]);
    const a = (audit || []).map(r => ({ ts: r.created_at, user: r.user_nom, action: r.action, detail: resumeAudit(r) }));
    const m = (mods || []).map(r => ({ ts: r.created_at, user: r.user_nom, action: r.action, detail: resumeMod(r) }));
    setItems([...a, ...m].sort((x, y) => new Date(y.ts) - new Date(x.ts)));
    setChargement(false);
  }, [boutiqueId]);
  useEffect(() => { charger(); }, [charger]);

  const filtres = items.filter(i => filtre === "tous" || i.action === filtre);
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  const couleur = (a) => a === "suppression" ? C.red : a === "modification" ? C.yellow : C.blue;
  const labelAction = (a) => ({ suppression: "Suppression", modification: "Modification", retour: "Retour/Avoir" }[a] || a);

  const FILTRES = [{ id: "tous", l: "Tout" }, { id: "suppression", l: "Suppressions" }, { id: "modification", l: "Modifs" }, { id: "retour", l: "Retours" }];

  return (
    <div style={{ padding: "0 12px 12px" }}>
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 12, marginBottom: 12 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: "bold", marginBottom: 4 }}>🕵️ Journal des actions sensibles</div>
        <div style={{ color: C.muted, fontSize: 11 }}>Trace des suppressions, modifications et retours. Visible par toi seul (patron).</div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {FILTRES.map(f => (
          <button key={f.id} onClick={() => setFiltre(f.id)}
            style={{ flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: "bold", cursor: "pointer",
              border: `1px solid ${filtre === f.id ? C.green : C.border}`, background: filtre === f.id ? C.green + "22" : "transparent", color: filtre === f.id ? C.green : C.muted }}>
            {f.l}
          </button>
        ))}
      </div>

      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        {chargement && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Chargement…</div>}
        {!chargement && filtres.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucune action enregistrée. (Lance bien les migrations SQL si la liste reste vide.)</div>}
        {filtres.map((it, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "9px 0", borderBottom: i < filtres.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: "bold", color: couleur(it.action), background: couleur(it.action) + "18", border: `1px solid ${couleur(it.action)}44`, borderRadius: 8, padding: "1px 7px" }}>{labelAction(it.action)}</span>
                <span style={{ color: C.muted, fontSize: 11 }}>{it.user || "?"}</span>
              </div>
              <div style={{ color: C.text, fontSize: 12, marginTop: 3 }}>{it.detail}</div>
            </div>
            <span style={{ color: C.muted, fontSize: 10, flexShrink: 0, marginLeft: 8 }}>{fmtDate(it.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const resumeAudit = (r) => {
  const d = r.details || {};
  if (r.action === "retour") return `Retour : ${d.resume || ""} (${fmt(d.refund || 0)} remboursé)`;
  return r.action;
};
const resumeMod = (r) => {
  const t = r.table_cible === "produits" ? "Produit" : r.table_cible === "historique" ? "Mouvement" : r.table_cible;
  const nom = r.ancienne_valeur?.nom || r.ancienne_valeur?.texte || r.cible_id;
  if (r.action === "suppression") return `${t} supprimé : ${nom}`;
  return `${t} modifié : ${nom}`;
};
