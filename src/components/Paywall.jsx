import React from "react";
import { C, fmt, envoyerWhatsApp } from "../theme";
import { t } from "../i18n";
import { ADMIN_WHATSAPP, PAIEMENT_INFOS, PRIX_ABONNEMENT } from "../config";

// Écran de blocage quand l'abonnement (ou l'essai) est expiré
export default function Paywall({ abonnement, nomBoutique, email, onDeconnexion }) {
  const demander = () => {
    const msg =
      `Bonjour 👋\n\n` +
      `Je souhaite m'abonner à Gangué Platform.\n` +
      `Boutique : ${nomBoutique || "—"}\n` +
      `Email : ${email || "—"}\n` +
      `Montant : ${fmt(PRIX_ABONNEMENT)} F/mois\n\n` +
      `J'ai effectué / je vais effectuer le paiement par Mobile Money. Merci d'activer mon compte.`;
    envoyerWhatsApp(ADMIN_WHATSAPP, msg);
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 20, fontWeight: "bold", color: C.text }}>
            {abonnement?.plan === "essai" ? t("essai_termine") : t("abonnement_expire")}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
            Réabonne-toi pour continuer à gérer {nomBoutique || "ta boutique"}.
          </div>
        </div>

        <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.green}55`, padding: 22, marginBottom: 14 }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 34, fontWeight: "bold", color: C.green }}>{fmt(PRIX_ABONNEMENT)} F</span>
            <span style={{ color: C.muted, fontSize: 14 }}> / {t("par_mois")}</span>
          </div>
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.9 }}>
            ✅ Boutiques & entrepôts illimités<br />
            ✅ Employés, caisse, transferts<br />
            ✅ Analyse, réassort, fournisseurs<br />
            ✅ Reçus WhatsApp, scan, hors-ligne
          </div>
        </div>

        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
          <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 8 }}>💳 PAYER PAR MOBILE MONEY</div>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.8 }}>
            🌊 Wave : <b>{PAIEMENT_INFOS.wave}</b><br />
            🟠 Orange Money : <b>{PAIEMENT_INFOS.orange}</b>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
            Envoie {fmt(PRIX_ABONNEMENT)} F, puis clique ci-dessous pour confirmer. Ton compte sera activé rapidement.
          </div>
        </div>

        <button onClick={demander}
          style={{ width: "100%", padding: 14, background: "#25D366", color: "#fff", border: "none", borderRadius: 10, fontWeight: "bold", fontSize: 15, cursor: "pointer", marginBottom: 10 }}>
          💬 {t("jai_paye")}
        </button>
        <button onClick={onDeconnexion}
          style={{ width: "100%", padding: 10, background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, cursor: "pointer" }}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
