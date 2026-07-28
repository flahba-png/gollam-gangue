import { fmt, envoyerWhatsApp } from "./theme";
import { ventesParProduit } from "./analytics";

// Rapport mensuel du patron : les chiffres qui comptent, en une page.
// PDF via impression navigateur + résumé texte envoyable WhatsApp.

const moisLabel = (moisISO) => {
  try {
    const [a, m] = moisISO.split("-");
    return new Date(parseInt(a), parseInt(m) - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  } catch { return moisISO; }
};

// Agrège les chiffres du mois (moisISO = "AAAA-MM")
export const chiffresDuMois = (historique, credits, moisISO) => {
  const duMois = historique.filter(h => (h.date_iso || "").startsWith(moisISO));
  let ca = 0, depenses = 0, marge = 0, nbVentes = 0;
  for (const h of duMois) {
    if (h.type === "vente") { ca += h.montant || 0; marge += h.benefice_etabli || 0; nbVentes++; }
    else if (h.type === "retour") { ca -= h.montant || 0; marge += h.benefice_etabli || 0; }
    else if (h.type === "depense") depenses += h.montant || 0;
  }
  const top = ventesParProduit(duMois).slice(0, 5);
  const creances = (credits || []).reduce((s, c) => s + (c.reste_a_payer || 0), 0);
  const nbDebiteurs = new Set((credits || []).filter(c => (c.reste_a_payer || 0) > 0).map(c => (c.client || "").toLowerCase())).size;
  return { ca, depenses, marge, benefice: marge - depenses, nbVentes, top, creances, nbDebiteurs };
};

export const imprimerRapportMensuel = (historique, credits, boutique, moisISO) => {
  const k = chiffresDuMois(historique, credits, moisISO);
  const label = moisLabel(moisISO);
  const topHTML = k.top.map((p, i) => `
    <tr><td>${i + 1}</td><td>${p.nom}</td><td style="text-align:center">${p.unites}</td>
    <td style="text-align:right">${fmt(p.ca)}</td><td style="text-align:right">${fmt(Math.round(p.marge))}</td></tr>`).join("");

  const w = window.open("", "_blank", "width=800,height=900");
  w.document.write(`<html><head><title>Rapport ${label} — ${boutique?.nom || ""}</title><style>
    body{font-family:Arial,sans-serif;color:#222;max-width:700px;margin:auto;padding:30px}
    h1{font-size:20px;margin:0} .sub{color:#666;font-size:13px;margin-bottom:20px}
    .kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:22px}
    .kpi{border:1px solid #e5e5e5;border-radius:10px;padding:14px}
    .kpi .l{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px}
    .kpi .v{font-size:22px;font-weight:bold;margin-top:4px}
    .green{color:#0a8a5e} .red{color:#c02626} .blue{color:#1d6fd1}
    h2{font-size:13px;text-transform:uppercase;color:#888;border-bottom:2px solid #eee;padding-bottom:6px;margin:24px 0 8px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#f5f5f5;text-align:left;padding:7px 8px;font-size:10px;text-transform:uppercase}
    td{padding:7px 8px;border-bottom:1px solid #f0f0f0}
    .foot{margin-top:34px;text-align:center;font-size:11px;color:#999;border-top:1px solid #ddd;padding-top:12px}
    .barre{display:flex;gap:8px;justify-content:space-between;align-items:center;background:#0a8a5e;color:#fff;padding:10px 14px;border-radius:10px;margin-bottom:18px}
    .barre button{background:#fff;color:#0a8a5e;border:none;border-radius:6px;padding:9px 14px;font-weight:bold;font-size:14px;cursor:pointer}
    @media print{.noprint{display:none!important}}
  </style></head><body>
    <div class="barre noprint">
      <button onclick="window.close()">← Retour</button>
      <span style="font-weight:bold">Rapport mensuel</span>
      <button onclick="window.print()">🖨️ Imprimer / PDF</button>
    </div>
    <h1>${boutique?.nom || "Boutique"} — Rapport mensuel</h1>
    <div class="sub">${label} · ${boutique?.ville || ""}${boutique?.rccm ? " · RCCM " + boutique.rccm : ""}</div>
    <div class="kpis">
      <div class="kpi"><div class="l">Chiffre d'affaires</div><div class="v green">${fmt(k.ca)}</div></div>
      <div class="kpi"><div class="l">Bénéfice net</div><div class="v ${k.benefice >= 0 ? "green" : "red"}">${fmt(k.benefice)}</div></div>
      <div class="kpi"><div class="l">Dépenses</div><div class="v red">${fmt(k.depenses)}</div></div>
      <div class="kpi"><div class="l">Créances clients (en cours)</div><div class="v blue">${fmt(k.creances)}${k.nbDebiteurs ? ` <span style="font-size:11px;color:#888">· ${k.nbDebiteurs} client(s)</span>` : ""}</div></div>
    </div>
    <h2>🏆 Top 5 produits du mois</h2>
    <table><tr><th>#</th><th>Produit</th><th style="text-align:center">Unités</th><th style="text-align:right">CA</th><th style="text-align:right">Marge</th></tr>
      ${topHTML || '<tr><td colspan="5">Aucune vente ce mois.</td></tr>'}</table>
    <div class="foot">Généré par Gollam le ${new Date().toLocaleDateString("fr-FR")} · ${k.nbVentes} vente(s) sur la période</div>
  </body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
};

// Résumé texte du rapport, envoyable en un clic sur WhatsApp
export const texteRapportMensuel = (historique, credits, boutique, moisISO) => {
  const k = chiffresDuMois(historique, credits, moisISO);
  return [
    `📊 ${boutique?.nom || "Boutique"} — Rapport ${moisLabel(moisISO)}`,
    `———`,
    `💰 Chiffre d'affaires : ${fmt(k.ca)}`,
    `📈 Bénéfice net : ${fmt(k.benefice)}`,
    `💸 Dépenses : ${fmt(k.depenses)}`,
    `📒 Créances en cours : ${fmt(k.creances)} (${k.nbDebiteurs} client(s))`,
    `🛒 ${k.nbVentes} vente(s) sur le mois`,
    k.top.length ? `🏆 Top : ${k.top.map(p => p.nom).slice(0, 3).join(", ")}` : "",
    `———`,
    `Généré par Gollam`,
  ].filter(Boolean).join("\n");
};

export const envoyerRapportWhatsApp = (historique, credits, boutique, moisISO, phone = "") =>
  envoyerWhatsApp(phone, texteRapportMensuel(historique, credits, boutique, moisISO));
