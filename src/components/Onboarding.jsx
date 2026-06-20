import React, { useState } from "react";
import { C } from "../theme";
import { t } from "../i18n";

const KEY = "gangue_onboarding_vu";

const ETAPES = [
  { emoji: "👋", titre: "Bienvenue sur Gollam !", texte: "Ton assistant pour gérer ta boutique : ventes, stock, crédits, employés — le tout depuis ton téléphone." },
  { emoji: "➕", titre: "Enregistre une vente", texte: "Va dans l'onglet « Saisie ». Ajoute tes produits au panier, choisis le mode de paiement, et valide. Un reçu est prêt à envoyer par WhatsApp." },
  { emoji: "📦", titre: "Gère ton stock", texte: "Onglet « Stock » : ajoute tes produits avec prix d'achat, prix de vente et quantité. L'app t'alerte quand un stock est bas." },
  { emoji: "📊", titre: "Pilote ton commerce", texte: "L'Accueil et les Stats te montrent ton bénéfice réel, tes meilleurs produits et l'argent qui dort. Tout en temps réel." },
];

export default function Onboarding({ onFini }) {
  const [i, setI] = useState(0);
  const derniere = i === ETAPES.length - 1;
  const e = ETAPES[i];

  const terminer = () => { localStorage.setItem(KEY, "1"); onFini(); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 600, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 360, textAlign: "center" }}>
        <div style={{ fontSize: 60, marginBottom: 18 }}>{e.emoji}</div>
        <div style={{ fontSize: 22, fontWeight: "bold", color: C.text, marginBottom: 10 }}>{e.titre}</div>
        <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.6, marginBottom: 28 }}>{e.texte}</div>

        {/* points */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
          {ETAPES.map((_, j) => (
            <div key={j} style={{ width: j === i ? 22 : 7, height: 7, borderRadius: 4, background: j === i ? C.green : C.border, transition: "all 0.2s" }} />
          ))}
        </div>

        <button onClick={() => derniere ? terminer() : setI(i + 1)}
          style={{ width: "100%", padding: 14, background: C.green, color: C.bg, border: "none", borderRadius: 12, fontWeight: "bold", fontSize: 15, cursor: "pointer", marginBottom: 10 }}>
          {derniere ? t("ob_commencer") : t("ob_suivant")}
        </button>
        {!derniere && (
          <button onClick={terminer} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 13, cursor: "pointer" }}>
            {t("ob_passer")}
          </button>
        )}
      </div>
    </div>
  );
}

export const onboardingVu = () => localStorage.getItem(KEY) === "1";
