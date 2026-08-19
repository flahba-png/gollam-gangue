import React, { useState } from "react";
import { C, DEVISES } from "../theme";
import { supabase } from "../supabase";
import { LANGUES_DISPO } from "../i18n";
import BoutiqueSwitcher from "./BoutiqueSwitcher";
import { msgErreur } from "../erreurs";

// Écran "Mon compte" : boutiques, email, changer mot de passe, déconnexion
export default function Compte({ email, onClose, onLogout, onStatut, onExport, onRestaurer, theme = "sombre", onTheme, langue = "fr", onLangue,
  devise = "XOF", onDevise,
  boutiques = [], boutiqueActive, vueGlobale, proprietaireId, estPatron, onSelectBoutique, onGlobale, onBoutiqueCreated, onBoutiqueUpdated }) {
  const [logoEnCours, setLogoEnCours] = useState(false);
  // Mentions légales des factures (RCCM, NCC, statut juridique, siège, paiement)
  const [rccm, setRccm] = useState(boutiqueActive?.rccm || "");
  const [ncc, setNcc] = useState(boutiqueActive?.ncc || "");
  const [statutJur, setStatutJur] = useState(boutiqueActive?.statut_juridique || "");
  const [siege, setSiege] = useState(boutiqueActive?.siege || "");
  const [infosPaiement, setInfosPaiement] = useState(boutiqueActive?.infos_paiement || "");

  const sauverMentions = async () => {
    if (!boutiqueActive) return;
    const patch = {
      rccm: rccm.trim() || null, ncc: ncc.trim() || null,
      statut_juridique: statutJur || null, siege: siege.trim() || null,
      infos_paiement: infosPaiement.trim() || null,
    };
    const { error } = await supabase.from("boutiques").update(patch).eq("id", boutiqueActive.id);
    if (error) { onStatut("⚠️ Mise à jour de la base requise (migrations 36-37) pour enregistrer ces informations."); return; }
    onBoutiqueUpdated && onBoutiqueUpdated({ ...boutiqueActive, ...patch });
    onStatut("✅ Informations enregistrées (visibles sur les factures).");
  };

  // Logo de la boutique pour ses reçus/factures : on redimensionne avant de stocker
  const changerLogo = (file) => {
    if (!file || !boutiqueActive) return;
    setLogoEnCours(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        const max = 240;
        const ratio = Math.min(max / img.width, max / img.height, 1);
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * ratio);
        cv.height = Math.round(img.height * ratio);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        const dataUrl = cv.toDataURL("image/png");
        const { error } = await supabase.from("boutiques").update({ logo: dataUrl }).eq("id", boutiqueActive.id);
        setLogoEnCours(false);
        if (error) { onStatut(msgErreur(error)); return; }
        onBoutiqueUpdated && onBoutiqueUpdated({ ...boutiqueActive, logo: dataUrl });
        onStatut("✅ Logo de la boutique mis à jour.");
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const retirerLogo = async () => {
    if (!boutiqueActive) return;
    await supabase.from("boutiques").update({ logo: null }).eq("id", boutiqueActive.id);
    onBoutiqueUpdated && onBoutiqueUpdated({ ...boutiqueActive, logo: null });
    onStatut("Logo retiré.");
  };
  const [nouveau, setNouveau] = useState("");
  const [voir, setVoir] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const changer = async () => {
    if ((nouveau || "").length < 6) { onStatut("⚠️ Mot de passe trop court (min 6)."); return; }
    setEnCours(true);
    const { error } = await supabase.auth.updateUser({ password: nouveau });
    setEnCours(false);
    if (error) { onStatut(msgErreur(error)); return; }
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
    // L'identifiant de connexion reste actif (suppression réservée à l'admin) :
    // on le dit clairement, sinon l'utilisateur croit pouvoir se réinscrire.
    onStatut("Données supprimées. Ton identifiant reste actif : reconnecte-toi avec le même email pour repartir de zéro (la réinscription avec cet email sera refusée).");
    onLogout();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20, margin: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: "bold", color: C.text }}>⚙️ Mon compte</div>
          <button onClick={onClose} aria-label="Fermer" style={{ width: 40, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 18, cursor: "pointer" }}>✕</button>
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

            {/* LOGO DE LA BOUTIQUE (reçus/factures) — patron */}
            {estPatron && !vueGlobale && boutiqueActive && (
              <div style={{ marginTop: 10, background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}`, padding: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                    {boutiqueActive.logo
                      ? <img src={boutiqueActive.logo} alt="logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                      : <span style={{ color: C.muted, fontSize: 18, fontWeight: "bold" }}>{(boutiqueActive.nom || "?").charAt(0).toUpperCase()}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.text, fontSize: 12, fontWeight: "bold" }}>Logo de la boutique</div>
                    <div style={{ color: C.muted, fontSize: 10 }}>Apparaît sur les reçus et factures de cette boutique.</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <label style={{ flex: 1, textAlign: "center", padding: "7px 0", background: C.green + "18", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 6, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
                    {logoEnCours ? "..." : (boutiqueActive.logo ? "Changer" : "📷 Ajouter un logo")}
                    <input type="file" accept="image/*" onChange={e => { const f = e.target.files[0]; e.target.value = ""; changerLogo(f); }} style={{ display: "none" }} />
                  </label>
                  {boutiqueActive.logo && (
                    <button onClick={retirerLogo}
                      style={{ padding: "7px 12px", background: C.red + "18", color: C.red, border: `1px solid ${C.red}44`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Retirer</button>
                  )}
                </div>
              </div>
            )}

            {/* MENTIONS LÉGALES FACTURES (RCCM + compte contribuable) */}
            {estPatron && !vueGlobale && boutiqueActive && (
              <div style={{ marginTop: 10, background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}`, padding: 10 }}>
                <div style={{ color: C.text, fontSize: 12, fontWeight: "bold" }}>🧾 Mentions légales (factures)</div>
                <div style={{ color: C.muted, fontSize: 10, marginBottom: 8 }}>Imprimées sur tes factures, devis et exports comptables. Tout est facultatif.</div>
                <input value={rccm} onChange={e => setRccm(e.target.value)} placeholder="N° RCCM (ex: CI-ABJ-2026-A-12345)"
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", marginBottom: 6, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13 }} />
                <input value={ncc} onChange={e => setNcc(e.target.value)} placeholder="N° compte contribuable (NCC)"
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", marginBottom: 6, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13 }} />
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <select value={statutJur} onChange={e => setStatutJur(e.target.value)}
                    style={{ flex: 1, padding: "9px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: statutJur ? C.text : C.muted, fontSize: 13 }}>
                    <option value="">Statut juridique —</option>
                    {["EI", "EURL", "SARL", "SA", "SAS", "SASU", "GIE", "Coopérative"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input value={siege} onChange={e => setSiege(e.target.value)} placeholder="Siège (ex: Daloa)"
                    style={{ flex: 1, boxSizing: "border-box", padding: "9px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13 }} />
                </div>
                <input value={infosPaiement} onChange={e => setInfosPaiement(e.target.value)} placeholder="💳 Paiement (ex: Wave 07 69 69 14 15 · OM 05 xx)"
                  title="Affiché sur les factures pour que tes clients sachent où payer"
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", marginBottom: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13 }} />
                <button onClick={sauverMentions}
                  style={{ width: "100%", padding: "8px 0", background: C.green + "18", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 6, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
                  Enregistrer les mentions
                </button>
              </div>
            )}
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
        {onRestaurer && (
          <label style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 11, background: C.green + "18", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer", marginBottom: 4, textAlign: "center" }}>
            ♻️ Restaurer une sauvegarde
            <input type="file" accept=".json,application/json" onChange={e => { const f = e.target.files[0]; e.target.value = ""; if (f) onRestaurer(f); }} style={{ display: "none" }} />
          </label>
        )}
        {onRestaurer && (
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 10, lineHeight: 1.4 }}>
            Réintègre les données d'un fichier <b>.json</b> sans créer de doublons (utile après une erreur ou un changement de téléphone).
          </div>
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

        {/* DEVISE (patron uniquement) */}
        {estPatron && onDevise && (
          <div style={{ padding: "10px 12px", background: C.surface2, borderRadius: 8, marginBottom: 8 }}>
            <div style={{ color: C.text, fontSize: 13, marginBottom: 6 }}>💱 Devise affichée</div>
            <select value={devise} onChange={e => onDevise(e.target.value)}
              style={{ width: "100%", padding: "9px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13 }}>
              {DEVISES.map(d => <option key={d.code} value={d.code}>{d.nom} — {d.symbole}</option>)}
            </select>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>Change le symbole monétaire dans toute l'app (montants, reçus, rapports).</div>
          </div>
        )}

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
