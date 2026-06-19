import React, { useState } from "react";
import { C } from "../theme";
import { supabase } from "../supabase";
import { LANGUES_DISPO } from "../i18n";
import BoutiqueSwitcher from "./BoutiqueSwitcher";

// Écran "Mon compte" : boutiques, email, changer mot de passe, déconnexion
export default function Compte({ email, onClose, onLogout, onStatut, onExport, theme = "sombre", onTheme, langue = "fr", onLangue,
  boutiques = [], boutiqueActive, vueGlobale, proprietaireId, estPatron, onSelectBoutique, onGlobale, onBoutiqueCreated }) {
  const [nouveau, setNouveau] = useState("");
  const [voir, setVoir] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const changer = async () => {
    if ((nouveau || "").length < 6) { onStatut("⚠️ Mot de passe trop court (min 6)."); return; }
    setEnCours(true);
    const { error } = await supabase.auth.updateUser({ password: nouveau });
    setEnCours(false);
    if (error) { onStatut("❌ " + error.message); return; }
    setNouveau("");
    onStatut("✅ Mot de passe modifié.");
    onClose();
  };

  const supprimerCompte = async () => {
    if (!confirm("⚠️ Supprimer ton compte effacera DÉFINITIVEMENT toutes tes boutiques, ventes, stocks et clients. Continuer ?")) return;
    if (!confirm("Es-tu vraiment sûr ? Cette action est irréversible.")) return;
    setEnCours(true);
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (uid) {
      // Supprime toutes les données (les boutiques cascadent vers produits/ventes/etc.)
      await supabase.from("boutiques").delete().eq("proprietaire_id", uid);
      await supabase.from("abonnements").delete().eq("proprietaire_id", uid);
      await supabase.from("membres").delete().eq("proprietaire_id", uid);
      await supabase.from("membres").delete().eq("user_id", uid);
    }
    await supabase.auth.signOut();
    onStatut("Compte et données supprimés.");
    onLogout();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20, margin: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: "bold", color: C.text }}>⚙️ Mon compte</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        {/* SÉLECTEUR DE BOUTIQUE */}
        {onSelectBoutique && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: "bold", marginBottom: 6 }}>🏪 BOUTIQUE ACTIVE</div>
            <BoutiqueSwitcher
              boutiques={boutiques} active={boutiqueActive} vueGlobale={vueGlobale}
              proprietaireId={proprietaireId} estPatron={estPatron}
              onSelect={(b) => { onSelectBoutique(b); }}
              onGlobale={onGlobale}
              onCreated={onBoutiqueCreated} />
          </div>
        )}

        <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>Email</div>
        <div style={{ background: C.surface2, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 13, marginBottom: 16 }}>{email}</div>

        <div style={{ fontSize: 11, color: C.muted, fontWeight: "bold", marginBottom: 8 }}>🔑 CHANGER LE MOT DE PASSE</div>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input type={voir ? "text" : "password"} value={nouveau} onChange={e => setNouveau(e.target.value)}
            placeholder="Nouveau mot de passe"
            style={{ width: "100%", padding: "10px 44px 10px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, boxSizing: "border-box", outline: "none" }} />
          <button type="button" onClick={() => setVoir(v => !v)}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", fontSize: 16 }}>
            {voir ? "🙈" : "👁️"}
          </button>
        </div>
        <button onClick={changer} disabled={enCours}
          style={{ width: "100%", padding: 11, background: enCours ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
          {enCours ? "..." : "Mettre à jour le mot de passe"}
        </button>

        {onExport && (
          <button onClick={onExport}
            style={{ width: "100%", padding: 11, background: C.blue + "18", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
            💾 Sauvegarder mes données
          </button>
        )}

        {/* PARAMÈTRES */}
        <div style={{ fontSize: 11, color: C.muted, fontWeight: "bold", marginBottom: 8 }}>⚙️ PARAMÈTRES</div>
        <a href="/aide.html" target="_blank" rel="noopener"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 12px", background: C.surface2, borderRadius: 8, marginBottom: 8, color: C.text, fontSize: 13, textDecoration: "none" }}>
          <span>❓ Aide & FAQ</span><span style={{ color: C.muted }}>›</span>
        </a>
        {/* THÈME */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: C.surface2, borderRadius: 8, marginBottom: 8 }}>
          <span style={{ color: C.text, fontSize: 13 }}>🎨 Thème</span>
          <div style={{ display: "flex", gap: 4, background: C.bg, borderRadius: 8, padding: 3 }}>
            {[{ id: "sombre", l: "🌙 Sombre" }, { id: "clair", l: "☀️ Clair" }].map(o => (
              <button key={o.id} onClick={() => onTheme && onTheme(o.id)}
                style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: "bold",
                  background: theme === o.id ? C.green : "transparent", color: theme === o.id ? C.bg : C.muted }}>
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {/* LANGUE */}
        <div style={{ padding: "10px 12px", background: C.surface2, borderRadius: 8, marginBottom: 8 }}>
          <div style={{ color: C.text, fontSize: 13, marginBottom: 8 }}>🌍 Langue</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {LANGUES_DISPO.map(l => (
              <button key={l.id} onClick={() => onLangue && onLangue(l.id)}
                style={{ padding: "8px 6px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: "bold",
                  border: `1px solid ${langue === l.id ? C.green : C.border}`,
                  background: langue === l.id ? C.green + "22" : "transparent",
                  color: langue === l.id ? C.green : C.text }}>
                {l.drapeau} {l.nom}
              </button>
            ))}
          </div>
        </div>

        <button onClick={onLogout}
          style={{ width: "100%", padding: 11, marginTop: 6, background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
          ⏏️ Se déconnecter
        </button>

        {/* LIENS LÉGAUX */}
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 14, fontSize: 11 }}>
          <a href="/confidentialite.html" target="_blank" rel="noopener" style={{ color: C.muted }}>Confidentialité</a>
          <a href="/cgu.html" target="_blank" rel="noopener" style={{ color: C.muted }}>Conditions d'utilisation</a>
        </div>

        {/* SUPPRESSION DE COMPTE */}
        <button onClick={supprimerCompte} disabled={enCours}
          style={{ width: "100%", padding: 9, background: "transparent", color: C.red, border: "none", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
          Supprimer définitivement mon compte
        </button>
      </div>
    </div>
  );
}
