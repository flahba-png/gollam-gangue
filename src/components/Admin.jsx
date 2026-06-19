import React, { useState, useEffect, useCallback } from "react";
import { C, fmt, appeler, envoyerWhatsApp } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";
import { PRIX_ABONNEMENT } from "../config";

// Panneau admin de la plateforme : activer / prolonger les abonnements
export default function Admin({ onStatut }) {
  const [abos, setAbos] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState("toutes"); // toutes | actives | expirees

  const charger = useCallback(async () => {
    const { data } = await supabase.from("abonnements").select("*").order("date_fin");
    setAbos(data || []);
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const prolonger = async (abo, mois) => {
    const base = new Date(abo.date_fin) > new Date() ? new Date(abo.date_fin) : new Date();
    base.setMonth(base.getMonth() + mois);
    await supabase.from("abonnements").update({ plan: "actif", date_fin: base.toISOString() }).eq("proprietaire_id", abo.proprietaire_id);
    onStatut(`✅ ${abo.nom || abo.email} activé +${mois} mois.`);
    charger();
  };

  const joursRestants = (a) => Math.ceil((new Date(a.date_fin) - new Date()) / 86400000);
  const estActif = (a) => new Date(a.date_fin) > new Date();

  const statut = (a) => {
    const j = joursRestants(a);
    if (!estActif(a)) return { c: C.red, t: "Expiré" };
    if (a.plan === "essai") return { c: C.yellow, t: `Essai ${j}j` };
    return { c: C.green, t: `Actif ${j}j` };
  };

  const couleurJours = (a) => {
    if (!estActif(a)) return C.red;
    const j = joursRestants(a);
    return j <= 3 ? C.red : j <= 7 ? C.yellow : C.green;
  };

  const relancer = (a) => envoyerWhatsApp(a.telephone, `Bonjour ${a.nom || ""} 👋\nVotre abonnement Gangué arrive à échéance. Pensez à renouveler (${fmt(PRIX_ABONNEMENT)} F/mois) pour continuer sans interruption. 🙏`);

  const filtres = abos
    .filter(a => !recherche || (a.nom || "").toLowerCase().includes(recherche.toLowerCase()) || (a.email || "").toLowerCase().includes(recherche.toLowerCase()))
    .filter(a => filtre === "toutes" || (filtre === "actives" ? estActif(a) : !estActif(a)));

  const ca = abos.filter(a => a.plan === "actif" && estActif(a)).length * PRIX_ABONNEMENT;
  const dateFr = (iso) => { try { return new Date(iso).toLocaleDateString("fr-FR"); } catch { return "—"; } };

  const FILTRES = [{ id: "toutes", l: "Toutes" }, { id: "actives", l: "Actives" }, { id: "expirees", l: "Expirées" }];

  return (
    <div style={{ padding: "0 12px 12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div style={{ background: C.surface, padding: 14, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: "bold" }}>{t("admin_clients").toUpperCase()}</div>
          <div style={{ fontSize: 22, fontWeight: "bold", color: C.text, marginTop: 4 }}>{abos.length}</div>
        </div>
        <div style={{ background: C.surface, padding: 14, borderRadius: 8, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: "bold" }}>{t("revenu_mensuel").toUpperCase()}</div>
          <div style={{ fontSize: 22, fontWeight: "bold", color: C.green, marginTop: 4 }}>{fmt(ca)} F</div>
        </div>
      </div>

      <input type="text" placeholder="🔍 Rechercher un client..." value={recherche} onChange={e => setRecherche(e.target.value)}
        style={{ width: "100%", padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, boxSizing: "border-box", marginBottom: 8 }} />

      {/* FILTRES RAPIDES */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {FILTRES.map(f => (
          <button key={f.id} onClick={() => setFiltre(f.id)}
            style={{ flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer",
              border: `1px solid ${filtre === f.id ? C.green : C.border}`, background: filtre === f.id ? C.green + "22" : "transparent", color: filtre === f.id ? C.green : C.muted }}>
            {f.l}
          </button>
        ))}
      </div>

      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>🧾 {t("abonnements").toUpperCase()} ({filtres.length})</div>
        {filtres.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun client.</div>}
        {filtres.map(a => {
          const s = statut(a);
          const j = joursRestants(a);
          return (
            <div key={a.proprietaire_id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: "bold" }}>{a.nom || "—"}</div>
                  <div style={{ color: C.muted, fontSize: 10 }}>{a.email}</div>
                  <div style={{ fontSize: 10, marginTop: 2 }}>
                    <span style={{ color: C.muted }}>Échéance : {dateFr(a.date_fin)} · </span>
                    <span style={{ color: couleurJours(a), fontWeight: "bold" }}>
                      {estActif(a) ? `${j} jour${j > 1 ? "s" : ""} restant${j > 1 ? "s" : ""}` : `expiré depuis ${-j} j`}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {a.telephone && (
                    <>
                      <button onClick={() => appeler(a.telephone)} title="Appeler" style={{ background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, padding: "4px 7px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>📞</button>
                      <button onClick={() => relancer(a)} title="Relancer WhatsApp" style={{ background: "#25D36622", color: "#25D366", border: "1px solid #25D36644", padding: "4px 7px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>💬</button>
                    </>
                  )}
                  <span style={{ background: s.c + "22", color: s.c, border: `1px solid ${s.c}55`, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>{s.t}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 3, 6, 12].map(m => (
                  <button key={m} onClick={() => prolonger(a, m)}
                    style={{ flex: 1, padding: "7px 0", background: C.green + "18", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 6, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
                    +{m} mois
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
