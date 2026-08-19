import React from "react";
import { C, fmt, envoyerWhatsApp } from "../theme";
import { t } from "../i18n";
import { ADMIN_WHATSAPP, PAIEMENT_INFOS, PRIX_ABONNEMENT, PRIX_ABONNEMENT_ANNUEL } from "../config";

// Écran de blocage quand l'abonnement (ou l'essai) est expiré
export default function Paywall({ abonnement, nomBoutique, email, stats, onDeconnexion, boutiquesEmploye = [], onAllerBoutique }) {
  const demander = (formule = "mois") => {
    const annuel = formule === "an";
    const montant = annuel ? PRIX_ABONNEMENT_ANNUEL : PRIX_ABONNEMENT;
    const msg =
      `Bonjour 👋\n\n` +
      `Je souhaite m'abonner à Gollam Platform.\n` +
      `Boutique : ${nomBoutique || "—"}\n` +
      `Email : ${email || "—"}\n` +
      `Formule : ${annuel ? "Annuelle (12 mois)" : "Mensuelle"}\n` +
      `Montant : ${fmt(montant)}${annuel ? "/an" : "/mois"}\n\n` +
      `J'ai effectué / je vais effectuer le paiement par Mobile Money. Merci d'activer mon compte.`;
    envoyerWhatsApp(ADMIN_WHATSAPP, msg);
  };

  const economie = PRIX_ABONNEMENT * 12 - PRIX_ABONNEMENT_ANNUEL;
  const aDesDonnees = stats && stats.boutiques > 0;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 20, fontWeight: "bold", color: C.text }}>
            {abonnement?.plan === "essai" ? t("essai_termine") : t("abonnement_expire")}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
            Réabonne-toi pour continuer à gérer {nomBoutique || "ta boutique"}.
          </div>
        </div>

        {/* AVERSION À LA PERTE — ce que le commerçant garde en se réabonnant */}
        {aDesDonnees && (
          <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.yellow}55`, padding: 16, marginBottom: 14 }}>
            <div style={{ color: C.yellow, fontWeight: "bold", fontSize: 11, marginBottom: 12 }}>⚠️ TON TRAVAIL T'ATTEND</div>
            <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: "bold", color: C.text }}>{stats.boutiques}</div>
                <div style={{ fontSize: 10, color: C.muted }}>boutique{stats.boutiques > 1 ? "s" : ""}</div>
              </div>
              {stats.produits > 0 && (
                <div>
                  <div style={{ fontSize: 22, fontWeight: "bold", color: C.text }}>{stats.produits}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>produits</div>
                </div>
              )}
              {stats.ventes > 0 && (
                <div>
                  <div style={{ fontSize: 22, fontWeight: "bold", color: C.text }}>{stats.ventes}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>ventes</div>
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 12, textAlign: "center", lineHeight: 1.6 }}>
              {stats.ca > 0 ? <>Tu as enregistré <b style={{ color: C.green }}>{fmt(stats.ca)}</b> de ventes. </> : null}
              Tes données sont en sécurité — réabonne-toi pour y accéder à nouveau.
            </div>
          </div>
        )}

        <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.green}55`, padding: 22, marginBottom: 14 }}>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 34, fontWeight: "bold", color: C.green }}>{fmt(PRIX_ABONNEMENT)}</span>
            <span style={{ color: C.muted, fontSize: 14 }}> / {t("par_mois")}</span>
          </div>

          {/* OFFRE ANNUELLE — 2 mois offerts */}
          <div onClick={() => demander("an")}
            style={{ cursor: "pointer", background: C.green + "18", border: `1px solid ${C.green}55`, borderRadius: 10, padding: "10px 12px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: "bold", color: C.green }}>💚 12 mois = {fmt(PRIX_ABONNEMENT_ANNUEL)}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>2 mois offerts · tu économises {fmt(economie)}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: "bold", color: C.green, whiteSpace: "nowrap" }}>Choisir ›</span>
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
            Envoie le montant, puis clique ci-dessous pour confirmer. Ton compte sera activé rapidement.
          </div>
        </div>

        <button onClick={() => demander("mois")}
          style={{ width: "100%", padding: 14, background: "#25D366", color: "#fff", border: "none", borderRadius: 10, fontWeight: "bold", fontSize: 15, cursor: "pointer", marginBottom: 10 }}>
          💬 {t("jai_paye")}
        </button>
        {/* Il travaille aussi comme employé ailleurs : ces boutiques restent accessibles */}
        {boutiquesEmploye.length > 0 && onAllerBoutique && (
          <div style={{ marginBottom: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>
              Ce blocage ne concerne que tes propres boutiques. Tu peux continuer à travailler là où tu es employé :
            </div>
            {boutiquesEmploye.map(b => (
              <button key={b.id} onClick={() => onAllerBoutique(b)}
                style={{ width: "100%", padding: 11, marginBottom: 6, background: C.blue + "18", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 10, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
                🏪 Aller à {b.nom}
              </button>
            ))}
          </div>
        )}
        <button onClick={onDeconnexion}
          style={{ width: "100%", padding: 10, background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, cursor: "pointer" }}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
