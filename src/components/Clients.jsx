import React, { useState, useMemo, useEffect, useCallback } from "react";
import { C, fmt, envoyerWhatsApp, appeler } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";

// Fiches clients : agrège crédits + historique par nom de client
export default function Clients({ credits, historique, boutique, boutiqueId }) {
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState(null);
  const [plafonds, setPlafonds] = useState({}); // client(lower) -> plafond
  const [editPlaf, setEditPlaf] = useState("");

  const chargerPlafonds = useCallback(async () => {
    if (!boutiqueId) return;
    const { data } = await supabase.from("plafonds").select("*").eq("boutique_id", boutiqueId);
    const map = {};
    (data || []).forEach(p => { map[p.client.toLowerCase()] = p.plafond; });
    setPlafonds(map);
  }, [boutiqueId]);

  useEffect(() => { chargerPlafonds(); }, [chargerPlafonds]);

  const definirPlafond = async (nomClient) => {
    const val = parseInt(editPlaf) || 0;
    await supabase.from("plafonds").upsert({ boutique_id: boutiqueId, client: nomClient, plafond: val }, { onConflict: "boutique_id,client" });
    setEditPlaf("");
    chargerPlafonds();
  };

  const clients = useMemo(() => {
    const map = new Map();

    const getC = (nom) => {
      const key = nom.trim().toLowerCase();
      if (!map.has(key)) map.set(key, { nom: nom.trim(), phone: "", dette: 0, totalAchats: 0, nbOperations: 0, operations: [] });
      return map.get(key);
    };

    // Dettes en cours (crédits)
    credits.forEach(cr => {
      if (!cr.client) return;
      const c = getC(cr.client);
      c.dette += cr.reste_a_payer || 0;
      if (cr.client_phone && !c.phone) c.phone = cr.client_phone;
    });

    // Historique d'achats (ventes nominatives)
    historique.forEach(h => {
      const nomCli = h.details_facture?.client;
      if (!nomCli || nomCli === "Client Comptoir") return;
      const c = getC(nomCli);
      c.totalAchats += h.montant || 0;
      c.nbOperations += 1;
      if (h.details_facture?.clientPhone && !c.phone) c.phone = h.details_facture.clientPhone;
      c.operations.push({
        date: h.date_iso, heure: h.heure, texte: h.texte,
        montant: h.montant || 0, reste: h.details_facture?.reste || 0,
      });
    });

    return [...map.values()].sort((a, b) => b.dette - a.dette || b.totalAchats - a.totalAchats);
  }, [credits, historique]);

  const filtres = clients.filter(c => !recherche || c.nom.toLowerCase().includes(recherche.toLowerCase()));

  const relancer = (c) => {
    const msg =
      `Bonjour ${c.nom} 👋\n\n` +
      `Ceci est un rappel amical de *${boutique?.nom || "notre boutique"}*.\n` +
      `Votre solde restant à régler est de *${fmt(c.dette)} F*.\n\n` +
      `Merci de passer quand vous pouvez pour régulariser. 🙏\n` +
      `Bonne journée !`;
    envoyerWhatsApp(c.phone, msg);
  };

  return (
    <div style={{ padding: "0 12px 12px" }}>
      <div style={{ marginBottom: 12 }}>
        <input type="text" placeholder={`🔍 ${t("rechercher_client")}`}
          value={recherche} onChange={e => setRecherche(e.target.value)}
          style={{ width: "100%", padding: "10px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, boxSizing: "border-box" }} />
      </div>

      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>
          👥 {t("fiches_clients").toUpperCase()} ({filtres.length})
        </div>

        {filtres.length === 0 && (
          <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", padding: "10px 0" }}>
            Aucun client enregistré. Les clients apparaissent dès une vente nominative ou un crédit.
          </div>
        )}

        {filtres.map((c, i) => {
          const estOuvert = ouvert === c.nom;
          return (
            <div key={i} style={{ borderBottom: `1px solid ${C.border}`, padding: "10px 0" }}>
              <div onClick={() => setOuvert(estOuvert ? null : c.nom)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: "bold", color: C.green }}>
                    {c.nom.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ color: C.text, fontSize: 14, fontWeight: "bold" }}>{c.nom}</div>
                    <div style={{ color: C.muted, fontSize: 10 }}>
                      {c.phone ? `📱 ${c.phone}` : "Pas de numéro"} · {c.nbOperations} achat(s)
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {c.dette > 0 ? (
                    <span style={{ background: C.red + "22", color: C.red, border: `1px solid ${C.red}55`, borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: "bold" }}>
                      Doit {fmt(c.dette)} F
                    </span>
                  ) : (
                    <span style={{ background: C.green + "22", color: C.green, border: `1px solid ${C.green}55`, borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: "bold" }}>
                      À jour ✅
                    </span>
                  )}
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>
                    Total : {fmt(c.totalAchats)} F
                  </div>
                </div>
              </div>

              {/* DÉTAIL DÉPLIÉ */}
              {estOuvert && (
                <div style={{ marginTop: 10, paddingLeft: 44 }}>
                  {c.phone && (
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <button onClick={() => appeler(c.phone)}
                        style={{ flex: 1, padding: "8px 0", background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 8, fontWeight: "bold", fontSize: 12, cursor: "pointer" }}>
                        📞 Appeler
                      </button>
                      <button onClick={() => envoyerWhatsApp(c.phone, `Bonjour ${c.nom}`)}
                        style={{ flex: 1, padding: "8px 0", background: "#25D36622", color: "#25D366", border: "1px solid #25D36644", borderRadius: 8, fontWeight: "bold", fontSize: 12, cursor: "pointer" }}>
                        💬 WhatsApp
                      </button>
                    </div>
                  )}
                  {c.dette > 0 && (
                    <button onClick={() => relancer(c)}
                      style={{ width: "100%", padding: "8px 0", marginBottom: 10, background: "#25D366", color: "#fff", border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 12, cursor: "pointer" }}>
                      💬 Relancer (rappel de dette)
                    </button>
                  )}

                  {/* PLAFOND DE CRÉDIT */}
                  {boutiqueId && (() => {
                    const plaf = plafonds[c.nom.toLowerCase()] || 0;
                    const depasse = plaf > 0 && c.dette > plaf;
                    return (
                      <div style={{ background: C.surface2, borderRadius: 8, padding: 10, marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                          <span style={{ color: C.muted }}>Plafond de crédit</span>
                          <span style={{ color: plaf > 0 ? (depasse ? C.red : C.green) : C.muted, fontWeight: "bold" }}>
                            {plaf > 0 ? `${fmt(c.dette)} / ${fmt(plaf)} F` : "Aucun"}
                          </span>
                        </div>
                        {plaf > 0 && (
                          <div style={{ background: C.border, borderRadius: 4, height: 4, marginTop: 6, overflow: "hidden" }}>
                            <div style={{ background: depasse ? C.red : C.green, height: 4, width: `${Math.min(100, Math.round((c.dette / plaf) * 100))}%` }} />
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <input type="number" inputMode="numeric" placeholder={plaf > 0 ? `${plaf}` : "Définir un plafond (F)"}
                            value={ouvert === c.nom ? editPlaf : ""} onChange={e => setEditPlaf(e.target.value)}
                            style={{ flex: 1, padding: "6px 8px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }} />
                          <button onClick={() => definirPlafond(c.nom)}
                            style={{ padding: "6px 12px", background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: "bold" }}>
                            OK
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ fontSize: 10, color: C.muted, fontWeight: "bold", marginBottom: 6 }}>HISTORIQUE D'ACHAT</div>
                  {c.operations.length === 0 && <div style={{ color: C.muted, fontSize: 11, fontStyle: "italic" }}>Aucun achat enregistré.</div>}
                  {c.operations.map((op, j) => (
                    <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>
                      <span style={{ color: C.text }}>{op.texte}</span>
                      <span style={{ color: C.muted, flexShrink: 0, marginLeft: 8 }}>
                        {fmt(op.montant)} F · {op.date}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
