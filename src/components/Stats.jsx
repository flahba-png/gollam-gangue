import React, { useMemo, useState } from "react";
import { C, fmt, todayISO } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";
import { ventesParProduit, stocksDormants, caMensuel, exporterAnalyseCSV, exporterAnalysePDF } from "../analytics";

const Row = ({ label, value, color, bold }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
    <span style={{ color: C.muted }}>{label}</span>
    <span style={{ color: color || C.text, fontWeight: bold ? "bold" : "normal" }}>{value}</span>
  </div>
);

const BarChart = ({ data, label }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ padding: "12px 0" }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, fontWeight: "bold" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 9, color: C.muted }}>{d.value > 0 ? fmt(d.value) : ""}</div>
            <div style={{ width: "100%", height: `${Math.max((d.value / max) * 60, d.value > 0 ? 4 : 0)}px`, background: d.color || C.green, borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} />
            <div style={{ fontSize: 9, color: C.muted, textAlign: "center" }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function Stats({ kpi, historique, produits, boutique, boutiqueActive, vueGlobale, onRefresh }) {
  const [tauxEdit, setTauxEdit] = useState(String(boutiqueActive?.taux_tva ?? 0));
  const taux = parseFloat(boutiqueActive?.taux_tva) || 0;

  // TVA du mois courant (prix considérés TTC)
  const moisISO = todayISO().slice(0, 7);
  const caTTCmois = historique
    .filter(h => (h.type === "vente" || h.type === "retour") && (h.date_iso || "").startsWith(moisISO))
    .reduce((s, h) => s + (h.type === "retour" ? -(h.montant || 0) : (h.montant || 0)), 0);
  const baseHT = taux > 0 ? Math.round(caTTCmois / (1 + taux / 100)) : caTTCmois;
  const tvaCollectee = caTTCmois - baseHT;

  const enregistrerTaux = async () => {
    if (!boutiqueActive) return;
    await supabase.from("boutiques").update({ taux_tva: parseFloat(tauxEdit) || 0 }).eq("id", boutiqueActive.id);
    onRefresh && onRefresh();
  };

  const exporterFiscal = () => {
    const lignes = [
      `Rapport fiscal ${boutique?.nom || ""} - ${moisISO}`,
      `Taux TVA;${taux}%`,
      `CA TTC;${caTTCmois}`,
      `Base HT;${baseHT}`,
      `TVA collectée;${tvaCollectee}`,
    ];
    const blob = new Blob(["﻿" + lignes.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `fiscal_${moisISO}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const txMarge = kpi.ca > 0 ? Math.round((kpi.margeTotal / kpi.ca) * 100) : 0;
  const nbVentes = historique.filter(h => h.type === "vente").length;

  const palmares = useMemo(
    () => ventesParProduit(historique).sort((a, b) => b.marge - a.marge),
    [historique]
  );
  const dormants = useMemo(
    () => stocksDormants(produits, historique, 30),
    [produits, historique]
  );
  const mois = useMemo(() => caMensuel(historique, 6), [historique]);

  const capitalDormantTotal = dormants.reduce((s, p) => s + p.capitalBloque, 0);

  // Règle 80/20 : combien de produits font 80% des bénéfices
  const margeTotal = palmares.reduce((s, p) => s + p.marge, 0);
  let cumul = 0, nbVitaux = 0;
  for (const p of palmares) {
    if (cumul >= margeTotal * 0.8) break;
    cumul += p.marge;
    nbVitaux++;
  }

  const dataPDF = { kpi, palmares, dormants, mois, txMarge, capitalDormantTotal };

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {/* INDICATEURS CLÉS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        {[
          { label: t("benefice_reel").toUpperCase(), value: `${fmt(kpi.benefice)} F`, color: kpi.benefice >= 0 ? C.green : C.red, big: true },
          { label: t("taux_marge").toUpperCase(), value: `${txMarge}%`, color: txMarge > 20 ? C.green : C.yellow, big: true },
          { label: t("nb_ventes").toUpperCase(), value: nbVentes, color: C.blue },
          { label: t("panier_moyen").toUpperCase(), value: `${fmt(nbVentes > 0 ? Math.round(kpi.ca / nbVentes) : 0)} F`, color: C.text },
        ].map(({ label, value, color, big }) => (
          <div key={label} style={{ background: C.surface, padding: 14, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: "bold" }}>{label}</div>
            <div style={{ fontSize: big ? 22 : 18, fontWeight: "bold", color, marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* BOUTONS EXPORT */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => exporterAnalysePDF(dataPDF, boutique)}
          style={{ flex: 1, padding: "10px 0", background: C.red + "22", color: C.red, border: `1px solid ${C.red}44`, borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
          📄 Export PDF
        </button>
        <button onClick={() => exporterAnalyseCSV(palmares, dormants, boutique)}
          style={{ flex: 1, padding: "10px 0", background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
          📊 Export Excel
        </button>
      </div>

      {/* CA MENSUEL */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <BarChart data={mois} label="CHIFFRE D'AFFAIRES — 6 DERNIERS MOIS" />
      </div>

      {/* RÈGLE 80/20 */}
      {nbVitaux > 0 && (
        <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.purple}55`, padding: 14, marginBottom: 12 }}>
          <div style={{ color: C.purple, fontWeight: "bold", fontSize: 12, marginBottom: 4 }}>🎯 RÈGLE 80/20</div>
          <div style={{ color: C.text, fontSize: 13 }}>
            <b>{nbVitaux}</b> produit{nbVitaux > 1 ? "s" : ""} génère{nbVitaux > 1 ? "nt" : ""} <b>80%</b> de tes bénéfices.
          </div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
            Concentre ton stock et ta trésorerie sur ces articles-là.
          </div>
        </div>
      )}

      {/* PALMARÈS PAR BÉNÉFICE RÉEL */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>🏆 {t("palmares").toUpperCase()}</div>
        {palmares.slice(0, 8).map((p, i) => (
          <div key={p.nom} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</span>
              <div>
                <div style={{ color: C.text, fontSize: 13 }}>{p.nom}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>{p.unites} vendu(s) · CA {fmt(p.ca)} F</div>
              </div>
            </div>
            <span style={{ background: C.green + "22", color: C.green, border: `1px solid ${C.green}55`, borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: "bold" }}>
              +{fmt(p.marge)} F
            </span>
          </div>
        ))}
        {palmares.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucune vente enregistrée pour le moment.</div>}
      </div>

      {/* STOCKS DORMANTS */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${capitalDormantTotal > 0 ? C.yellow : C.border}55`, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ color: C.yellow, fontWeight: "bold", fontSize: 11 }}>💤 STOCKS DORMANTS (+30 jours)</div>
          {capitalDormantTotal > 0 && (
            <span style={{ color: C.red, fontSize: 11, fontWeight: "bold" }}>{fmt(capitalDormantTotal)} F bloqués</span>
          )}
        </div>
        {dormants.length === 0 ? (
          <div style={{ color: C.green, fontSize: 12, fontStyle: "italic" }}>👍 Tout ton stock tourne. Aucun capital dormant.</div>
        ) : (
          dormants.slice(0, 8).map(p => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
              <div>
                <div style={{ color: C.text }}>{p.nom}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>{p.stock} u en stock · jamais vendu récemment</div>
              </div>
              <span style={{ color: C.red, fontWeight: "bold", fontSize: 12 }}>{fmt(p.capitalBloque)} F</span>
            </div>
          ))
        )}
      </div>

      {/* TVA / FISCALITÉ */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginTop: 12 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>💶 TVA & FISCALITÉ</div>
        {!vueGlobale && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: C.muted, fontSize: 12, flex: 1 }}>Taux de TVA (%)</span>
            <input type="number" inputMode="decimal" value={tauxEdit} onChange={e => setTauxEdit(e.target.value)} placeholder="0"
              style={{ width: 70, padding: "6px 8px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, textAlign: "right" }} />
            <button onClick={enregistrerTaux} style={{ padding: "6px 12px", background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 6, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>OK</button>
          </div>
        )}
        {taux > 0 ? (
          <>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>MOIS EN COURS ({moisISO}) — prix TTC</div>
            <Row label="CA TTC" value={`${fmt(caTTCmois)} F`} />
            <Row label="Base HT" value={`${fmt(baseHT)} F`} />
            <Row label={`TVA collectée (${taux}%)`} value={`${fmt(tvaCollectee)} F`} color={C.yellow} bold />
            <button onClick={exporterFiscal}
              style={{ width: "100%", marginTop: 10, padding: "9px 0", background: C.blue + "22", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
              📄 Exporter le rapport fiscal
            </button>
          </>
        ) : (
          <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>TVA désactivée. Mets un taux (ex: 18) si tu te formalises.</div>
        )}
      </div>
    </div>
  );
}
