import { fmt, today, modePaiement, envoyerWhatsApp } from "./theme";

// Libellé du paiement : « Espèces » ou, si mixte, « Espèces 1 000 + Wave 1 000 »
const libellePaiement = (log) => {
  if (log.paiements && typeof log.paiements === "object" && Object.keys(log.paiements).length > 1) {
    return Object.entries(log.paiements).map(([k, v]) => `${modePaiement(k).label} ${fmt(v)}`).join(" + ");
  }
  return modePaiement(log.mode_paiement).label;
};

// Génère un reçu texte propre, lisible dans WhatsApp
export const genererTexteRecu = (log, boutique) => {
  const info = log.details_facture || { client: "Client Comptoir", article: log.texte, total: log.montant, reste: 0, type: "Vente" };
  const mode = modePaiement(log.mode_paiement);
  const num = (log.id ?? "").toString().slice(-6).toUpperCase();

  const lignes = [
    `*${(boutique?.nom || "GOLLAM").toUpperCase()}*`,
    boutique?.ville ? `${boutique.ville} — Côte d'Ivoire` : "Côte d'Ivoire",
    `🧾 Reçu N° ${num}`,
    `📅 ${today()} à ${log.heure}`,
    `━━━━━━━━━━━━━━━`,
    `👤 Client : ${info.client}`,
  ];

  // Détail des articles (panier multi-lignes si présent)
  if (Array.isArray(info.lignes) && info.lignes.length) {
    info.lignes.forEach(l => lignes.push(`• ${l.qte}x ${l.nom} — ${fmt(l.total)}`));
  } else {
    lignes.push(`📦 ${info.article}`);
  }

  lignes.push(`━━━━━━━━━━━━━━━`);
  if (info.remise > 0) lignes.push(`🏷️ Remise : -${fmt(info.remise)}`);
  const taux = parseFloat(boutique?.taux_tva) || 0;
  if (taux > 0) {
    const ht = Math.round((info.total || 0) / (1 + taux / 100));
    lignes.push(`HT : ${fmt(ht)}`, `TVA ${taux}% : ${fmt((info.total || 0) - ht)}`);
  }
  lignes.push(
    `💰 ${taux > 0 ? "TTC" : "Net"} : *${fmt(info.total)}*`,
    `${mode.emoji} Paiement : ${libellePaiement(log)}`,
  );

  if (info.reste > 0) {
    lignes.push(`⚠️ Reste à payer : *${fmt(info.reste)}*`);
  } else {
    lignes.push(`✅ SOLDÉ`);
  }

  lignes.push(`━━━━━━━━━━━━━━━`, `Merci pour votre confiance ! 🙏`);
  return lignes.join("\n");
};

// Envoie le reçu au client par WhatsApp
export const envoyerRecuWhatsApp = (log, boutique) => {
  const info = log.details_facture || {};
  const texte = genererTexteRecu(log, boutique);
  envoyerWhatsApp(info.clientPhone || "", texte);
};

// Impression thermique (petite imprimante Bluetooth / navigateur)
export const imprimerFacture = (log, boutique) => {
  const info = log.details_facture || { client: "Client Comptoir", article: log.texte, total: log.montant, reste: 0, type: "Vente Directe" };
  const mode = modePaiement(log.mode_paiement);
  const w = window.open("", "_blank", "width=380,height=600");
  w.document.write(`<html><head><title>Reçu</title><style>
    @page { size: 58mm auto; margin: 0; }
    body{font-family:'Courier New',monospace;padding:8px;width:54mm;margin:0 auto;color:#000;font-size:12px}
    .h{text-align:center;border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:8px}
    .logo{width:42px;height:42px;border-radius:50%;border:2px solid #000;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:bold;margin:0 auto 6px}
    .t{font-size:15px;font-weight:bold;letter-spacing:1px}
    .i{font-size:10px;margin:2px 0}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    td{padding:4px 0;border-bottom:1px dashed #ccc;font-size:11px}
    .tot{font-size:13px;font-weight:bold;text-align:right;margin-top:8px}
    .f{text-align:center;margin-top:14px;font-size:9px;border-top:1px dashed #000;padding-top:6px}
    .barre{display:flex;gap:6px;justify-content:space-between;align-items:center;margin-bottom:8px}
    .barre button{flex:1;background:#0a8a5e;color:#fff;border:none;border-radius:6px;padding:8px 4px;font-weight:bold;font-size:12px;cursor:pointer}
    @media print{.noprint{display:none!important}}
  </style></head><body>
    <div class="barre noprint">
      <button onclick="window.close()">← Retour</button>
      <button onclick="window.print()">🖨️ Imprimer</button>
    </div>
    <div class="h">${boutique?.logo ? `<img src="${boutique.logo}" alt="logo" style="max-width:120px;max-height:60px;object-fit:contain;margin:0 auto 6px;display:block" />` : `<div class="logo">${(boutique?.nom || "G").charAt(0).toUpperCase()}</div>`}<div class="t">${(boutique?.nom || "GOLLAM").toUpperCase()}</div>
    <div class="i">Pièces Auto & Moto — ${boutique?.ville || "Côte d'Ivoire"}</div>
    <div class="i">${today()} à ${log.heure}</div>
    <div class="i">Reçu N° ${(log.id ?? "").toString().slice(-6).toUpperCase()}</div></div>
    <div class="i"><b>CLIENT :</b> ${info.client}</div>
    <div class="i"><b>PAIEMENT :</b> ${mode.emoji} ${libellePaiement(log)}</div>
    <table><tr style="font-weight:bold"><td>Article</td><td style="text-align:right">Montant</td></tr>
    ${Array.isArray(info.lignes) && info.lignes.length
      ? info.lignes.map(l => `<tr><td>${l.qte}x ${l.nom}</td><td style="text-align:right">${fmt(l.total)}</td></tr>`).join("")
      : `<tr><td>${info.article}</td><td style="text-align:right">${fmt(info.total)}</td></tr>`}
    </table>
    ${info.remise > 0 ? `<div class="tot" style="font-size:11px;color:#000">Remise : -${fmt(info.remise)}</div>` : ""}
    ${(() => { const taux = parseFloat(boutique?.taux_tva) || 0; if (taux <= 0) return ""; const ht = Math.round((info.total || 0) / (1 + taux / 100)); return `<div class="tot" style="font-size:10px;font-weight:normal">HT : ${fmt(ht)} &nbsp; TVA ${taux}% : ${fmt((info.total || 0) - ht)}</div>`; })()}
    <div class="tot">TOTAL : ${fmt(info.total)}</div>
    <div class="tot" style="color:${info.reste > 0 ? '#000' : '#000'};font-size:11px">
      ${info.reste > 0 ? `RESTE DÛ : ${fmt(info.reste)}` : "✅ SOLDÉ"}</div>
    <div class="f">Merci pour votre confiance !</div>
  </body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
};
