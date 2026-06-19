import React from "react";
import { C, fmt, MODES_PAIEMENT } from "../theme";
import { t } from "../i18n";

const StatCard = ({ label, value, color, sub }) => (
  <div style={{ background: C.surface, padding: 14, borderRadius: 8, border: `1px solid ${C.border}` }}>
    <div style={{ fontSize: 10, color: C.muted, fontWeight: "bold", letterSpacing: 1 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: "bold", color, marginTop: 4 }}>{fmt(value)} F</div>
    {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>}
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
            <div style={{
              width: "100%",
              height: `${Math.max((d.value / max) * 60, d.value > 0 ? 4 : 0)}px`,
              background: d.color || C.green,
              borderRadius: "3px 3px 0 0",
              transition: "height 0.3s"
            }} />
            <div style={{ fontSize: 9, color: C.muted, textAlign: "center" }}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function Dashboard({ kpi, historique, credits, produits, estPatron = true, onImprimer, onWhatsApp }) {
  const alertesStock = produits.filter(p => (p.stock || 0) <= 2);

  const chartData = (() => {
    const jours = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 2);
      const ventes = historique.filter(h => h.date_iso === iso && h.type === "vente").reduce((s, h) => s + (h.montant || 0), 0);
      jours.push({ label, value: ventes, color: C.green });
    }
    return jours;
  })();

  // Totaux encaissés par mode de paiement (ventes uniquement)
  const totauxParMode = MODES_PAIEMENT.map(m => ({
    ...m,
    total: historique
      .filter(h => (h.type === "vente" || h.type === "retour") && (h.mode_paiement || "especes") === m.id)
      .reduce((s, h) => s + (h.type === "retour" ? -(h.montant || 0) : (h.montant || 0)), 0),
  }));
  const totalEncaisse = totauxParMode.reduce((s, m) => s + m.total, 0);

  const boutiqueVide = produits.length === 0 && historique.length === 0;

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {boutiqueVide && (
        <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.green}55`, padding: 18, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: "bold", color: C.text, marginBottom: 10 }}>👋 Bienvenue ! Démarre en 2 étapes</div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>📦</span>
            <div style={{ fontSize: 13, color: C.muted }}><b style={{ color: C.text }}>1. Ajoute tes produits</b><br />Onglet ➕ Saisie → « Stock » → mets prix d'achat, prix de vente et quantité.</div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🛒</span>
            <div style={{ fontSize: 13, color: C.muted }}><b style={{ color: C.text }}>2. Enregistre ta première vente</b><br />Onglet ➕ Saisie → ajoute au panier → choisis le paiement → valide.</div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <StatCard label={t("chiffre_affaires")} value={kpi.ca} color={C.green} />
        {estPatron && <StatCard label={t("depenses")} value={kpi.depenses} color={C.red} />}
        {estPatron && <StatCard label={t("benefice_net")} value={kpi.benefice} color={kpi.benefice >= 0 ? C.green : C.red} />}
        <StatCard label={t("creances")} value={kpi.dettes} color={C.yellow} sub={`${credits.length} client(s)`} />
      </div>

      {/* RÉPARTITION CAISSE PAR MODE DE PAIEMENT */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11 }}>💰 {t("caisse_par_mode").toUpperCase()}</div>
          <div style={{ color: C.text, fontSize: 11, fontWeight: "bold" }}>{fmt(totalEncaisse)} F</div>
        </div>
        {totalEncaisse === 0 ? (
          <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun encaissement enregistré.</div>
        ) : (
          totauxParMode.filter(m => m.total > 0).map(m => {
            const pct = Math.round((m.total / totalEncaisse) * 100);
            return (
              <div key={m.id} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: C.text }}>{m.emoji} {m.label}</span>
                  <span style={{ color: m.color, fontWeight: "bold" }}>{fmt(m.total)} F <span style={{ color: C.muted, fontWeight: "normal" }}>· {pct}%</span></span>
                </div>
                <div style={{ background: C.surface2, borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ background: m.color, height: 6, width: `${pct}%`, transition: "width 0.3s" }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <BarChart data={chartData} label={`${t("ventes_7j").toUpperCase()} (FCFA)`} />
      </div>

      {alertesStock.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.red}55`, padding: 14, marginBottom: 12 }}>
          <div style={{ color: C.red, fontWeight: "bold", fontSize: 12, marginBottom: 8 }}>⚠️ {t("alertes_stock").toUpperCase()} ({alertesStock.length})</div>
          {alertesStock.map(p => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
              <span style={{ color: C.text }}>{p.nom}</span>
              <span style={{ background: C.red + "22", color: C.red, border: `1px solid ${C.red}55`, borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: "bold" }}>
                {p.stock} unité(s)
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 12, marginBottom: 10 }}>📝 {t("dernieres_operations").toUpperCase()}</div>
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {historique.slice(0, 10).map(h => (
            <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
              <span>
                <span style={{ color: C.muted, marginRight: 6 }}>{h.heure}</span>
                <span style={{ color: C.text }}>{h.texte}</span>
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {h.type === "transfert" ? (
                  <span style={{ background: C.blue + "22", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 12, padding: "2px 8px", fontSize: 9, fontWeight: "bold" }}>
                    Mouvement
                  </span>
                ) : (
                  <span style={{ color: h.type === "vente" ? C.green : h.type === "depense" ? C.red : C.text, fontWeight: "bold" }}>
                    {h.type === "depense" ? "-" : "+"}{fmt(h.montant)} F
                  </span>
                )}
                {h.type === "vente" && (
                  <>
                    <button onClick={() => onWhatsApp(h)} style={{ background: "#25D36622", color: "#25D366", border: "1px solid #25D36644", padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>
                      💬
                    </button>
                    <button onClick={() => onImprimer(h)} style={{ background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>
                      🖨️
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {historique.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>{t("aucune_operation")}</div>}
        </div>
      </div>
    </div>
  );
}
