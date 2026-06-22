import React, { useState, useEffect, useCallback, useMemo } from "react";
import { C, fmt, todayISO, MODES_PAIEMENT, repartitionPaiement } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";

// Clôture de caisse (rapport Z) : fond + attendu vs compté = écart
export default function Cloture({ historique, boutiqueActive, monNom, estPatron, onStatut }) {
  const [dateF, setDateF] = useState(todayISO());
  const [vendeurFiltre, setVendeurFiltre] = useState(estPatron ? "tous" : monNom);
  const [fond, setFond] = useState("");
  const [compte, setCompte] = useState("");
  const [passees, setPassees] = useState([]);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!boutiqueActive) return;
    const { data } = await supabase.from("clotures").select("*").eq("boutique_id", boutiqueActive.id).order("created_at", { ascending: false }).limit(10);
    setPassees(data || []);
  }, [boutiqueActive]);

  useEffect(() => { charger(); }, [charger]);

  // Liste des vendeurs présents dans l'historique
  const vendeurs = useMemo(() => {
    const set = new Set();
    historique.forEach(h => { if (h.type === "vente") set.add(h.vendeur_nom || "Patron"); });
    return [...set];
  }, [historique]);

  // Totaux par mode pour la date + vendeur sélectionnés
  const totaux = useMemo(() => {
    const tot = {};
    MODES_PAIEMENT.forEach(m => { tot[m.id] = 0; });
    historique.forEach(h => {
      if (h.date_iso !== dateF) return;
      if (h.type !== "vente" && h.type !== "retour") return;
      if (vendeurFiltre !== "tous" && (h.vendeur_nom || "Patron") !== vendeurFiltre) return;
      const signe = h.type === "retour" ? -1 : 1;
      Object.entries(repartitionPaiement(h)).forEach(([mode, montant]) => { tot[mode] = (tot[mode] || 0) + signe * (montant || 0); });
    });
    return tot;
  }, [historique, dateF, vendeurFiltre]);

  // Détail : ventes pures vs règlements de créanciers (remboursements du jour)
  const detail = useMemo(() => {
    let ventesPures = 0, reglements = 0;
    const estReglement = (h) => {
      const ty = h.details_facture?.type || "";
      return ty === "Remboursement Partiel" || ty === "Solde de Compte" || (h.texte || "").includes("Versement");
    };
    historique.forEach(h => {
      if (h.date_iso !== dateF || h.type !== "vente") return;
      if (vendeurFiltre !== "tous" && (h.vendeur_nom || "Patron") !== vendeurFiltre) return;
      if (estReglement(h)) reglements += h.montant || 0;
      else ventesPures += h.montant || 0;
    });
    return { ventesPures, reglements };
  }, [historique, dateF, vendeurFiltre]);

  const ventesEspeces = totaux.especes || 0;
  const fondF = parseInt(fond) || 0;
  const attendu = fondF + ventesEspeces;
  const ecart = (parseInt(compte) || 0) - attendu;
  const totalGlobal = MODES_PAIEMENT.reduce((s, m) => s + (totaux[m.id] || 0), 0);

  const cloturer = async () => {
    if (compte === "") { onStatut("⚠️ Saisis le montant compté en caisse."); return; }
    setEnCours(true);
    await supabase.from("clotures").insert({
      boutique_id: boutiqueActive.id,
      vendeur_nom: vendeurFiltre === "tous" ? "Tous" : vendeurFiltre,
      date: dateF,
      fond_caisse: parseInt(fond) || 0,
      ventes_especes: ventesEspeces,
      attendu_especes: attendu,
      compte_especes: parseInt(compte) || 0,
      ecart,
      totaux_modes: totaux,
    });
    setEnCours(false);
    setFond(""); setCompte("");
    onStatut(!estPatron ? "✅ Caisse clôturée. Merci !" : ecart === 0 ? "✅ Caisse clôturée, aucun écart." : `⚠️ Caisse clôturée. Écart : ${fmt(ecart)}`);
    charger();
  };

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {/* FILTRES */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="date" value={dateF} onChange={e => setDateF(e.target.value)}
            style={{ flex: 1, padding: "8px 10px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }} />
          {estPatron && (
            <select value={vendeurFiltre} onChange={e => setVendeurFiltre(e.target.value)}
              style={{ flex: 1, padding: "8px 10px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }}>
              <option value="tous">{t("tous_vendeurs")}</option>
              {vendeurs.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* TOTAUX PAR MODE */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11 }}>💰 {t("encaissements_jour").toUpperCase()}</div>
          <div style={{ color: C.text, fontWeight: "bold", fontSize: 12 }}>{fmt(totalGlobal)}</div>
        </div>
        {MODES_PAIEMENT.filter(m => totaux[m.id] > 0).map(m => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
            <span style={{ color: C.text }}>{m.emoji} {m.label}</span>
            <span style={{ color: m.color, fontWeight: "bold" }}>{fmt(totaux[m.id])}</span>
          </div>
        ))}
        {/* Détail de la provenance */}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
            <span style={{ color: C.muted }}>🛒 Ventes du jour</span>
            <span style={{ color: C.text }}>{fmt(detail.ventesPures)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
            <span style={{ color: C.muted }}>📒 Règlements créanciers</span>
            <span style={{ color: C.text }}>{fmt(detail.reglements)}</span>
          </div>
        </div>
        {totalGlobal === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucune vente ce jour.</div>}
      </div>

      {/* COMPTAGE ESPÈCES */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>🧮 {t("comptage_especes").toUpperCase()}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Ligne label={t("fond_caisse")} >
            <input type="number" inputMode="numeric" value={fond} onChange={e => setFond(e.target.value)} placeholder="0" style={inp} />
          </Ligne>
          <Ligne label={t("ventes_especes")}><span style={{ color: C.green, fontWeight: "bold" }}>{fmt(ventesEspeces)}</span></Ligne>
          <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0" }} />
          {/* Clôture aveugle : le vendeur ne voit pas l'attendu ni l'écart */}
          {estPatron ? (
            <Ligne label={t("attendu_caisse")}><span style={{ color: C.text, fontWeight: "bold" }}>{fmt(attendu)}</span></Ligne>
          ) : (
            <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic", padding: "2px 0" }}>
              🔒 Compte la caisse à l'aveugle. L'écart sera vérifié par le gérant.
            </div>
          )}
          <Ligne label={t("compte_physique")}>
            <input type="number" inputMode="numeric" value={compte} onChange={e => setCompte(e.target.value)} placeholder="0" style={inp} />
          </Ligne>
          {estPatron && compte !== "" && (
            <div style={{ background: (ecart === 0 ? C.green : C.red) + "18", border: `1px solid ${(ecart === 0 ? C.green : C.red)}55`, borderRadius: 8, padding: 10, textAlign: "center", marginTop: 4 }}>
              <div style={{ fontSize: 10, color: C.muted }}>{t("ecart").toUpperCase()}</div>
              <div style={{ fontSize: 20, fontWeight: "bold", color: ecart === 0 ? C.green : C.red }}>
                {ecart > 0 ? "+" : ""}{fmt(ecart)}
              </div>
              <div style={{ fontSize: 10, color: C.muted }}>{ecart === 0 ? "Caisse juste ✅" : ecart > 0 ? "Excédent" : "Manquant"}</div>
            </div>
          )}
          <button onClick={cloturer} disabled={enCours}
            style={{ padding: 12, background: enCours ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 14, cursor: "pointer", marginTop: 4 }}>
            {enCours ? "..." : `🔒 ${t("cloturer_caisse")}`}
          </button>
        </div>
      </div>

      {/* HISTORIQUE DES CLÔTURES */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>📋 {t("clotures_recentes").toUpperCase()}</div>
        {passees.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucune clôture enregistrée.</div>}
        {passees.map(c => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
            <div>
              <div style={{ color: C.text }}>{c.date} · {c.vendeur_nom}</div>
              <div style={{ color: C.muted, fontSize: 10 }}>Attendu {fmt(c.attendu_especes)} · Compté {fmt(c.compte_especes)}</div>
            </div>
            <span style={{ background: (c.ecart === 0 ? C.green : C.red) + "22", color: c.ecart === 0 ? C.green : C.red, border: `1px solid ${(c.ecart === 0 ? C.green : C.red)}55`, borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: "bold" }}>
              {c.ecart > 0 ? "+" : ""}{fmt(c.ecart)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const Ligne = ({ label, children }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
    <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
    {children}
  </div>
);

const inp = { width: 120, padding: "7px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 13, textAlign: "right", outline: "none" };
