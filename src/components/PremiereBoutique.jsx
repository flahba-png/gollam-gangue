import React, { useState } from "react";
import { C } from "../theme";
import { supabase } from "../supabase";
import { msgErreur } from "../erreurs";

// Écran affiché quand le compte n'a aucune boutique :
// après une suppression de données, ou pour un employé pas encore rattaché.
export default function PremiereBoutique({ email, proprietaireId, onCreated, onLogout, onRafraichir }) {
  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const creer = async () => {
    if (!nom.trim()) { setErreur("Donne un nom à ta boutique."); return; }
    setEnCours(true); setErreur("");
    const { data, error } = await supabase.from("boutiques")
      .insert({ proprietaire_id: proprietaireId, nom: nom.trim(), ville: ville.trim(), type: "boutique" })
      .select().single();
    setEnCours(false);
    if (error) { setErreur(msgErreur(error, "La création")); return; }
    onCreated(data);
  };

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🏪</div>
          <div style={{ fontSize: 19, fontWeight: "bold" }}>Crée ta boutique</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
            Ton compte n'a encore aucune boutique. Donne-lui un nom pour commencer.
          </div>
        </div>

        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <label style={{ display: "block", fontSize: 9, color: C.muted, fontWeight: "bold", letterSpacing: 0.5, marginBottom: 4 }}>NOM DE LA BOUTIQUE *</label>
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex : GANGUE.SERVICES" autoFocus
            style={champ} />
          <label style={{ display: "block", fontSize: 9, color: C.muted, fontWeight: "bold", letterSpacing: 0.5, margin: "12px 0 4px" }}>VILLE</label>
          <input value={ville} onChange={e => setVille(e.target.value)} placeholder="Ex : Daloa" style={champ} />

          {erreur && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{erreur}</div>}

          <button onClick={creer} disabled={enCours}
            style={{ width: "100%", padding: 13, marginTop: 16, background: enCours ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 10, fontWeight: "bold", fontSize: 15, cursor: "pointer" }}>
            {enCours ? "Création..." : "Créer ma boutique"}
          </button>
        </div>

        {/* Cas de l'employé pas encore rattaché */}
        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, color: C.text, fontWeight: "bold", marginBottom: 4 }}>🧑‍🤝‍🧑 Tu es employé ?</div>
          <div style={{ fontSize: 12, color: C.muted }}>
            Demande à ton patron de t'ajouter dans <b style={{ color: C.text }}>Équipe</b> avec ton email :
            <div style={{ background: C.surface2, borderRadius: 6, padding: "6px 10px", marginTop: 6, color: C.text, fontSize: 12, wordBreak: "break-all" }}>{email}</div>
          </div>
          <button onClick={onRafraichir}
            style={{ width: "100%", padding: 10, marginTop: 10, background: C.blue + "18", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
            🔄 C'est fait, vérifier
          </button>
        </div>

        <button onClick={onLogout}
          style={{ width: "100%", padding: 10, marginTop: 12, background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, cursor: "pointer" }}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

const champ = { width: "100%", boxSizing: "border-box", padding: "11px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 14, outline: "none" };
