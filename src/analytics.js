import { fmt, today } from "./theme";

// Parse "2x Pneu" → { qte: 2, nom: "Pneu" }. Retourne null si ce n'est pas une vente d'article.
const parseArticle = (article) => {
  if (!article) return null;
  const m = article.match(/^(\d+)x\s+(.+)$/);
  if (!m) return null; // exclut les "Acompte : ...", remboursements, etc.
  return { qte: parseInt(m[1]), nom: m[2].trim() };
};

// Agrège les ventes réelles par produit depuis l'historique
export const ventesParProduit = (historique) => {
  const map = new Map();
  const ajouter = (nom, qte, ca, marge) => {
    const key = nom.toLowerCase();
    if (!map.has(key)) map.set(key, { nom, unites: 0, ca: 0, marge: 0 });
    const e = map.get(key);
    e.unites += qte;
    e.ca += ca;
    e.marge += marge;
  };

  historique.forEach(h => {
    if (h.type !== "vente" && h.type !== "retour") return;
    const signe = h.type === "retour" ? -1 : 1;
    const info = h.details_facture;
    // Panier multi-lignes : on ventile par ligne (marge répartie au prorata du CA)
    if (Array.isArray(info?.lignes) && info.lignes.length) {
      const totalCA = info.lignes.reduce((s, l) => s + (l.total || 0), 0) || 1;
      info.lignes.forEach(l => {
        const partMarge = (h.benefice_etabli || 0) * ((l.total || 0) / totalCA);
        // retour : qte et CA négatifs ; benefice_etabli est déjà négatif → on ajoute tel quel
        ajouter(l.nom, signe * (l.qte || 0), signe * (l.total || 0), h.type === "retour" ? partMarge : partMarge);
      });
      return;
    }
    if (h.type !== "vente") return;
    // Ancien format mono-produit "Nx Nom"
    const parsed = parseArticle(info?.article);
    if (!parsed) return;
    ajouter(parsed.nom, parsed.qte, info?.total || h.montant || 0, h.benefice_etabli || 0);
  });
  return [...map.values()];
};

// Produits en stock qui n'ont eu aucune vente depuis `jours` jours (capital bloqué)
export const stocksDormants = (produits, historique, jours = 30) => {
  const limite = new Date();
  limite.setDate(limite.getDate() - jours);
  const limiteISO = limite.toISOString().split("T")[0];

  const vendusRecemment = new Set();
  historique.forEach(h => {
    if (h.type !== "vente" || !h.date_iso || h.date_iso < limiteISO) return;
    const info = h.details_facture;
    if (Array.isArray(info?.lignes) && info.lignes.length) {
      info.lignes.forEach(l => vendusRecemment.add((l.nom || "").trim().toLowerCase()));
      return;
    }
    const parsed = info?.article?.match(/^\d+x\s+(.+)$/);
    if (parsed) vendusRecemment.add(parsed[1].trim().toLowerCase());
  });

  return produits
    .filter(p => (p.stock || 0) > 0 && !vendusRecemment.has(p.nom?.toLowerCase()))
    .map(p => ({ ...p, capitalBloque: (p.stock || 0) * (p.prix_achat || 0) }))
    .sort((a, b) => b.capitalBloque - a.capitalBloque);
};

// CA mensuel sur les `n` derniers mois
export const caMensuel = (historique, n = 6) => {
  const mois = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const prefixe = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("fr-FR", { month: "short" });
    const value = historique
      .filter(h => h.type === "vente" && (h.date_iso || "").startsWith(prefixe))
      .reduce((s, h) => s + (h.montant || 0), 0);
    mois.push({ label, value });
  }
  return mois;
};

// Export Excel (CSV ouvrable dans Excel) du palmarès produits
export const exporterAnalyseCSV = (palmares, dormants, boutique) => {
  const lignes = [
    `Rapport ${boutique?.nom || "Boutique"} - ${today()}`,
    "",
    "PALMARES DES VENTES",
    ["Produit", "Unités vendues", "Chiffre d'affaires (F)", "Marge nette (F)"].join(";"),
    ...palmares.map(p => [p.nom, p.unites, p.ca, p.marge].join(";")),
    "",
    "STOCKS DORMANTS (capital bloqué)",
    ["Produit", "Stock", "Prix achat (F)", "Capital bloqué (F)"].join(";"),
    ...dormants.map(p => [p.nom, p.stock, p.prix_achat, p.capitalBloque].join(";")),
  ];
  const blob = new Blob(["﻿" + lignes.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analyse_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// Export PDF (via fenêtre d'impression) d'un rapport complet
export const exporterAnalysePDF = (data, boutique) => {
  const { kpi, palmares, dormants, mois, txMarge, capitalDormantTotal } = data;
  const w = window.open("", "_blank", "width=800,height=900");
  const ligneProduit = palmares.slice(0, 10).map((p, i) =>
    `<tr><td>${i + 1}</td><td>${p.nom}</td><td style="text-align:right">${p.unites}</td><td style="text-align:right">${fmt(p.ca)} F</td><td style="text-align:right;color:#0a0">${fmt(p.marge)} F</td></tr>`
  ).join("");
  const ligneDormant = dormants.slice(0, 10).map(p =>
    `<tr><td>${p.nom}</td><td style="text-align:right">${p.stock} u</td><td style="text-align:right;color:#c00">${fmt(p.capitalBloque)} F</td></tr>`
  ).join("");

  w.document.write(`<html><head><title>Rapport financier</title><style>
    body{font-family:Arial,sans-serif;padding:30px;color:#222;max-width:720px;margin:auto}
    h1{font-size:22px;margin:0}
    .sub{color:#666;font-size:13px;margin-bottom:20px}
    .kpis{display:flex;gap:12px;margin:20px 0;flex-wrap:wrap}
    .kpi{flex:1;min-width:120px;border:1px solid #ddd;border-radius:8px;padding:12px}
    .kpi .l{font-size:10px;color:#888;text-transform:uppercase}
    .kpi .v{font-size:20px;font-weight:bold;margin-top:4px}
    h2{font-size:15px;border-bottom:2px solid #00A884;padding-bottom:6px;margin-top:28px}
    table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
    th,td{padding:7px 8px;border-bottom:1px solid #eee;text-align:left}
    th{background:#f5f5f5;font-size:11px;text-transform:uppercase}
    .f{margin-top:30px;font-size:11px;color:#999;text-align:center;border-top:1px solid #ddd;padding-top:12px}
  </style></head><body>
    <h1>${boutique?.nom || "Boutique"}</h1>
    <div class="sub">Rapport financier · ${boutique?.ville || ""} · ${today()}</div>
    <div class="kpis">
      <div class="kpi"><div class="l">Chiffre d'affaires</div><div class="v" style="color:#00A884">${fmt(kpi.ca)} F</div></div>
      <div class="kpi"><div class="l">Dépenses</div><div class="v" style="color:#c00">${fmt(kpi.depenses)} F</div></div>
      <div class="kpi"><div class="l">Bénéfice net</div><div class="v" style="color:${kpi.benefice >= 0 ? '#00A884' : '#c00'}">${fmt(kpi.benefice)} F</div></div>
      <div class="kpi"><div class="l">Taux de marge</div><div class="v">${txMarge}%</div></div>
    </div>
    <h2>🏆 Palmarès des ventes (par bénéfice réel)</h2>
    <table><tr><th>#</th><th>Produit</th><th style="text-align:right">Unités</th><th style="text-align:right">CA</th><th style="text-align:right">Marge nette</th></tr>${ligneProduit || '<tr><td colspan="5">Aucune vente.</td></tr>'}</table>
    <h2>💤 Stocks dormants — capital bloqué : ${fmt(capitalDormantTotal)} F</h2>
    <table><tr><th>Produit</th><th style="text-align:right">Stock</th><th style="text-align:right">Capital bloqué</th></tr>${ligneDormant || '<tr><td colspan="3">Aucun stock dormant. 👍</td></tr>'}</table>
    <div class="f">Généré par Gangué Platform</div>
  </body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
};
