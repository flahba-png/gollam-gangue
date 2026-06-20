import React, { useState } from "react";
import { supabase } from "../supabase";
import { C } from "../theme";
import { t } from "../i18n";

export default function Auth() {
  const [mode, setMode] = useState("login"); // login | register | reset
  const [compte, setCompte] = useState("proprietaire"); // proprietaire | employe
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [voirMdp, setVoirMdp] = useState(false);
  const [nom, setNom] = useState("");           // nom de l'employé
  const [nomBoutique, setNomBoutique] = useState("");
  const [ville, setVille] = useState("");
  const [chargement, setChargement] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setChargement(true);
    setMessage("");

    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      setMessage(error ? "❌ " + error.message : "✅ Email de réinitialisation envoyé ! Vérifie ta boîte mail (et les spams).");
      setChargement(false);
      return;
    }

    if (mode === "register") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: compte === "employe" ? { nom } : { nom_boutique: nomBoutique, ville }
        }
      });

      if (error) {
        setMessage("❌ " + error.message);
      } else if (compte === "employe") {
        // L'employé crée juste son compte. Il sera rattaché à une boutique
        // par son patron (qui l'ajoute par email), puis lié à la connexion.
        setMessage("✅ Compte employé créé ! Demande à ton patron de t'ajouter, puis connecte-toi.");
        setMode("login");
      } else {
        // Créer la première boutique du propriétaire
        if (data.user) {
          await supabase.from("boutiques").insert({
            proprietaire_id: data.user.id,
            nom: nomBoutique,
            ville,
            email
          });
        }
        setMessage("✅ Compte créé ! Connecte-toi.");
        setMode("login");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage("❌ Email ou mot de passe incorrect.");
    }

    setChargement(false);
  };

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: 20
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* LOGO */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔧</div>
          <div style={{ fontSize: 22, fontWeight: "bold", color: C.green }}>Gollam Platform</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Gestion commerciale · Côte d'Ivoire</div>
        </div>

        {/* FORMULAIRE */}
        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 24 }}>
          <div style={{ display: "flex", marginBottom: 20, background: C.surface2, borderRadius: 8, padding: 4 }}>
            {["login", "register"].map(m => (
              <button key={m} onClick={() => { setMode(m); setMessage(""); }}
                style={{
                  flex: 1, padding: "8px 0", border: "none", borderRadius: 6, cursor: "pointer",
                  background: mode === m ? C.green : "transparent",
                  color: mode === m ? C.bg : C.muted, fontWeight: "bold", fontSize: 13
                }}>
                {m === "login" ? t("connexion") : t("inscription")}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {mode === "register" && (
              <>
                {/* Type de compte */}
                <div style={{ display: "flex", gap: 6 }}>
                  {[{ id: "proprietaire", label: "🏪 Propriétaire" }, { id: "employe", label: "👤 Employé" }].map(t => (
                    <button key={t.id} type="button" onClick={() => setCompte(t.id)}
                      style={{
                        flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer",
                        border: `1px solid ${compte === t.id ? C.green : C.border}`,
                        background: compte === t.id ? C.green + "22" : "transparent",
                        color: compte === t.id ? C.green : C.muted,
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {compte === "employe" ? (
                  <input
                    placeholder="Votre nom (ex: Mamadou)"
                    value={nom} onChange={e => setNom(e.target.value)} required
                    style={inputStyle}
                  />
                ) : (
                  <>
                    <input
                      placeholder="Nom de votre boutique"
                      value={nomBoutique} onChange={e => setNomBoutique(e.target.value)} required
                      style={inputStyle}
                    />
                    <input
                      placeholder="Ville (ex: Abidjan, Bouaké...)"
                      value={ville} onChange={e => setVille(e.target.value)} required
                      style={inputStyle}
                    />
                  </>
                )}
              </>
            )}
            <input
              type="email" placeholder={t("email")} value={email}
              onChange={e => setEmail(e.target.value)} required style={inputStyle}
            />

            {mode !== "reset" && (
              <div style={{ position: "relative" }}>
                <input
                  type={voirMdp ? "text" : "password"} placeholder={t("mot_de_passe")} value={password}
                  onChange={e => setPassword(e.target.value)} required
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingRight: 44 }}
                />
                <button type="button" onClick={() => setVoirMdp(v => !v)} title={voirMdp ? "Masquer" : "Afficher"}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", fontSize: 16, padding: 4 }}>
                  {voirMdp ? "🙈" : "👁️"}
                </button>
              </div>
            )}

            {mode === "login" && (
              <button type="button" onClick={() => { setMode("reset"); setMessage(""); }}
                style={{ background: "transparent", border: "none", color: C.muted, fontSize: 12, cursor: "pointer", textAlign: "right", padding: 0, marginTop: -4 }}>
                {t("mdp_oublie")}
              </button>
            )}

            {mode === "reset" && (
              <button type="button" onClick={() => { setMode("login"); setMessage(""); }}
                style={{ background: "transparent", border: "none", color: C.muted, fontSize: 12, cursor: "pointer", textAlign: "left", padding: 0 }}>
                ← Retour à la connexion
              </button>
            )}

            {message && (
              <div style={{
                padding: "8px 12px", borderRadius: 6, fontSize: 12, textAlign: "center",
                background: message.startsWith("✅") ? C.green + "22" : C.red + "22",
                color: message.startsWith("✅") ? C.green : C.red,
                border: `1px solid ${message.startsWith("✅") ? C.green : C.red}44`
              }}>
                {message}
              </div>
            )}

            <button type="submit" disabled={chargement}
              style={{
                padding: 12, background: chargement ? C.muted : C.green, color: C.bg,
                border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 14,
                cursor: chargement ? "not-allowed" : "pointer", marginTop: 4
              }}>
              {chargement ? "⏳ Chargement..." : mode === "login" ? t("se_connecter") : mode === "reset" ? "Envoyer le lien" : t("creer_compte")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  padding: "10px 14px",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 13,
  outline: "none"
};
