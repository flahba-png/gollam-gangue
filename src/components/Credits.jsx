import React, { useState, useMemo } from "react";
import { C, fmt, heure, todayISO, envoyerWhatsApp, envoyerSMS, ageEnJours, SEUIL_RETARD } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";

export default function Credits({ credits, kpi, boutiqueId, onRefresh, onStatut, boutique }) {
  const messageRelance = (c) =>
    `Bonjour ${c.client} 👋\n\n` +
    `Rappel de *${boutique?.nom || "notre boutique"}*.\n` +
    `Article : ${c.article}\n` +
    `Montant total : ${fmt(c.total)}\n` +
    `Déjà payé : ${fmt(c.avance)}\n` +
    `Reste à payer : *${fmt(c.reste_a_payer)}*\n\n` +
    `Merci de régulariser quand vous pouvez. 🙏`;

  const relancer = (c) => envoyerWhatsApp(c.client_phone, messageRelance(c));
  const relancerSMS = (c) => envoyerSMS(c.client_phone, messageRelance(c));

  const [montantsRembours, setMontantsRembours] = useState({});

  // Créances en retard (impayées depuis +SEUIL_RETARD jours), triées par ancienneté
  const enRetard = useMemo(
    () => credits
      .filter(c => (c.reste_a_payer || 0) > 0 && ageEnJours(c) >= SEUIL_RETARD)
      .sort((a, b) => ageEnJours(b) - ageEnJours(a)),
    [credits]
  );
  const totalRetard = enRetard.reduce((s, c) => s + (c.reste_a_payer || 0), 0);

  // Relance groupée : ouvre une fenêtre WhatsApp par client en retard (avec numéro)
  const relancerTous = () => {
    const avecTel = enRetard.filter(c => c.client_phone);
    if (avecTel.length === 0) { onStatut("⚠️ Aucun client en retard n'a de numéro enregistré."); return; }
    avecTel.forEach((c, i) => setTimeout(() => envoyerWhatsApp(c.client_phone, messageRelance(c)), i * 600));
    onStatut(`💬 ${avecTel.length} relance(s) WhatsApp ouverte(s).`);
  };

  const encaisserCredit = async (creditId) => {
    const fiche = credits.find(c => c.id === creditId);
    if (!fiche) return;
    const montant = parseInt(montantsRembours[creditId]) || 0;
    if (montant <= 0) { onStatut("⚠️ Entre un montant valide."); return; }
    if (montant > fiche.reste_a_payer) { onStatut(`⚠️ Dépasse la dette (${fmt(fiche.reste_a_payer)})`); return; }

    const nouveau = fiche.reste_a_payer - montant;

    await supabase.from("historique").insert({
      boutique_id: boutiqueId,
      heure: heure(),
      date_iso: todayISO(),
      texte: `💰 Versement de ${fiche.client} (${fiche.article})`,
      type: "vente",
      montant,
      benefice_etabli: 0,
      details_facture: { client: fiche.client, article: `Acompte : ${fiche.article}`, total: montant, reste: nouveau, type: nouveau === 0 ? "Solde de Compte" : "Remboursement Partiel" }
    });

    if (nouveau === 0) {
      await supabase.from("credits").delete().eq("id", creditId);
      onStatut(`✅ Crédit de ${fiche.client} entièrement soldé !`);
    } else {
      await supabase.from("credits").update({ avance: fiche.avance + montant, reste_a_payer: nouveau }).eq("id", creditId);
      onStatut(`✅ Versement noté. Reste : ${fmt(nouveau)}`);
    }

    setMontantsRembours(prev => ({ ...prev, [creditId]: "" }));
    onRefresh();
  };

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {/* RELANCES AUTOMATIQUES : clients en retard */}
      {enRetard.length > 0 && (
        <div style={{ background: C.red + "14", borderRadius: 8, border: `1px solid ${C.red}55`, padding: 14, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ color: C.red, fontWeight: "bold", fontSize: 13 }}>
              ⏰ {enRetard.length} client(s) en retard (+{SEUIL_RETARD}j)
            </div>
            <span style={{ color: C.red, fontWeight: "bold", fontSize: 12 }}>{fmt(totalRetard)}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {enRetard.slice(0, 4).map(c => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: C.text }}>{c.client} <span style={{ color: C.muted }}>· {ageEnJours(c)}j</span></span>
                <span style={{ color: C.red, fontWeight: "bold" }}>{fmt(c.reste_a_payer)}</span>
              </div>
            ))}
            {enRetard.length > 4 && <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>… +{enRetard.length - 4} autres</div>}
          </div>
          <button onClick={relancerTous}
            style={{ width: "100%", padding: 9, background: "#25D366", color: "#fff", border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
            💬 Relancer tous les retards par WhatsApp
          </button>
        </div>
      )}

      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.yellow}55`, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ color: C.yellow, fontWeight: "bold", fontSize: 13 }}>📒 {t("carnet_credits").toUpperCase()}</div>
          <span style={{ background: C.yellow + "22", color: C.yellow, border: `1px solid ${C.yellow}55`, borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: "bold" }}>
            {credits.length} client(s) · {fmt(kpi.dettes)}
          </span>
        </div>

        {credits.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", padding: "20px 0", textAlign: "center" }}>
            ✅ {t("aucune_dette")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {credits.map(c => (
              <div key={c.id} style={{ background: C.surface2, padding: 14, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: "bold", color: C.text, fontSize: 14 }}>{c.client}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{c.article}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>Total : {fmt(c.total)} · Avance : {fmt(c.avance)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ background: C.red + "22", color: C.red, border: `1px solid ${C.red}55`, borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: "bold" }}>
                      Reste : {fmt(c.reste_a_payer)}
                    </span>
                    {c.date && <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>{c.date}</div>}
                    {(c.reste_a_payer || 0) > 0 && ageEnJours(c) >= SEUIL_RETARD && (
                      <div style={{ marginTop: 4, display: "inline-block", background: C.red + "22", color: C.red, border: `1px solid ${C.red}55`, borderRadius: 10, padding: "1px 7px", fontSize: 9, fontWeight: "bold" }}>
                        ⏰ {ageEnJours(c)}j de retard
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ background: C.border, borderRadius: 4, height: 4, marginBottom: 10 }}>
                  <div style={{ background: C.green, borderRadius: 4, height: 4, width: `${Math.round((c.avance / c.total) * 100)}%`, transition: "width 0.3s" }} />
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>
                  Remboursé : {Math.round((c.avance / c.total) * 100)}%
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="number" placeholder={t("somme_recue")}
                    value={montantsRembours[c.id] || ""}
                    onChange={e => setMontantsRembours(prev => ({ ...prev, [c.id]: e.target.value }))}
                    style={{ flex: 1, padding: "7px 10px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }} />
                  <button onClick={() => encaisserCredit(c.id)}
                    style={{ background: C.yellow, color: C.bg, border: "none", padding: "7px 14px", borderRadius: 6, fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>
                    {t("encaisser")} 💰
                  </button>
                  <button onClick={() => relancer(c)} title="Relancer par WhatsApp"
                    style={{ background: "#25D366", color: "#fff", border: "none", padding: "7px 10px", borderRadius: 6, fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>
                    💬
                  </button>
                  <button onClick={() => relancerSMS(c)} title="Relancer par SMS"
                    style={{ background: C.blue + "22", color: C.blue, border: `1px solid ${C.blue}44`, padding: "7px 10px", borderRadius: 6, fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>
                    📩
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
