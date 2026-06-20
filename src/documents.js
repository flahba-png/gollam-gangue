import { fmt, today, envoyerWhatsApp, envoyerSMS } from "./theme";

export const LIBELLE_DOC = {
  devis: "DEVIS",
  facture: "FACTURE",
  bon_livraison: "BON DE LIVRAISON",
};

// Document imprimable A4 (impression → enregistrer en PDF)
export const imprimerDocument = (doc, boutique) => {
  const titre = LIBELLE_DOC[doc.type] || "DOCUMENT";
  const avecPrix = doc.type !== "bon_livraison";
  const w = window.open("", "_blank", "width=800,height=900");

  const lignesHTML = (doc.lignes || []).map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${l.nom}</td>
      <td style="text-align:center">${l.qte}</td>
      ${avecPrix ? `<td style="text-align:right">${fmt(l.pu)}</td><td style="text-align:right">${fmt(l.qte * l.pu)}</td>` : ""}
    </tr>`).join("");

  const totaux = avecPrix ? `
    <div class="totaux">
      <table>
        <tr><td>Sous-total</td><td>${fmt((doc.total_ht || 0) + (doc.remise || 0))}</td></tr>
        ${doc.remise > 0 ? `<tr><td>Remise</td><td>-${fmt(doc.remise)}</td></tr>` : ""}
        <tr><td>Total HT</td><td>${fmt(doc.total_ht)}</td></tr>
        ${doc.taux_tva > 0 ? `<tr><td>TVA (${doc.taux_tva}%)</td><td>${fmt((doc.total_ttc || 0) - (doc.total_ht || 0))}</td></tr>` : ""}
        <tr class="grand"><td>TOTAL ${doc.taux_tva > 0 ? "TTC" : ""}</td><td>${fmt(doc.total_ttc)}</td></tr>
      </table>
    </div>` : "";

  w.document.write(`<html><head><title>${titre} ${doc.numero || ""}</title><style>
    body{font-family:Arial,sans-serif;color:#222;max-width:720px;margin:auto;padding:30px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1FD08A;padding-bottom:16px;margin-bottom:6px}
    .logo{width:54px;height:54px;border-radius:50%;border:2px solid #1FD08A;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:bold;color:#1FD08A;float:left;margin-right:12px}
    .bn{font-size:20px;font-weight:bold} .bv{font-size:12px;color:#666}
    .doc{text-align:right} .doc .t{font-size:26px;font-weight:bold;letter-spacing:2px;color:#1FD08A}
    .doc .n{font-size:13px;color:#444;margin-top:4px}
    .infos{display:flex;justify-content:space-between;margin:18px 0;font-size:13px}
    .infos .b{font-weight:bold;text-transform:uppercase;font-size:10px;color:#888}
    table.items{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
    table.items th{background:#f3f3f3;text-align:left;padding:8px;font-size:11px;text-transform:uppercase}
    table.items td{padding:8px;border-bottom:1px solid #eee}
    .totaux{display:flex;justify-content:flex-end;margin-top:14px}
    .totaux table{font-size:13px} .totaux td{padding:4px 10px;text-align:right}
    .totaux td:first-child{color:#666;text-align:left}
    .totaux .grand td{font-size:16px;font-weight:bold;border-top:2px solid #222;color:#1FD08A}
    .notes{margin-top:24px;font-size:12px;color:#555;background:#f8f8f8;padding:12px;border-radius:6px}
    .foot{margin-top:30px;text-align:center;font-size:11px;color:#999;border-top:1px solid #ddd;padding-top:12px}
  </style></head><body>
    <div class="top">
      <div><div class="logo">${(boutique?.nom || "G").charAt(0).toUpperCase()}</div>
        <div class="bn">${boutique?.nom || "Ma Boutique"}</div>
        <div class="bv">${boutique?.ville || "Côte d'Ivoire"}</div></div>
      <div class="doc"><div class="t">${titre}</div><div class="n">N° ${doc.numero || "—"}<br>Date : ${doc.date || today()}
        ${doc.type === "devis" && doc.validite ? `<br>Valable jusqu'au ${doc.validite}` : ""}</div></div>
    </div>
    <div class="infos">
      <div><div class="b">Émis par</div>${boutique?.nom || ""}<br>${boutique?.ville || ""}</div>
      <div style="text-align:right"><div class="b">Destinataire</div>${doc.client || "Client"}<br>${doc.client_phone || ""}</div>
    </div>
    <table class="items"><tr><th>#</th><th>Désignation</th><th style="text-align:center">Qté</th>
      ${avecPrix ? "<th style='text-align:right'>P.U.</th><th style='text-align:right'>Total</th>" : ""}</tr>
      ${lignesHTML}</table>
    ${totaux}
    ${doc.notes ? `<div class="notes"><b>Notes :</b> ${doc.notes}</div>` : ""}
    ${doc.type === "devis" ? '<div class="notes">Ce devis est valable sous réserve de disponibilité des articles. Bon pour accord : __________</div>' : ""}
    <div class="foot">Merci pour votre confiance — ${boutique?.nom || "Gangué"}</div>
  </body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
};

// Résumé texte du document (partagé WhatsApp / SMS)
export const texteDocument = (doc, boutique) => {
  const titre = LIBELLE_DOC[doc.type] || "DOCUMENT";
  const avecPrix = doc.type !== "bon_livraison";
  const lignes = [
    `${titre} N° ${doc.numero || ""}`,
    `${boutique?.nom || ""} — ${boutique?.ville || ""}`,
    `${doc.date || today()}`,
    `Client : ${doc.client || "Client"}`,
    `---`,
    ...(doc.lignes || []).map(l => avecPrix ? `${l.qte}x ${l.nom} — ${fmt(l.qte * l.pu)}` : `${l.qte}x ${l.nom}`),
    `---`,
  ];
  if (avecPrix) {
    if (doc.remise > 0) lignes.push(`Remise : -${fmt(doc.remise)}`);
    if (doc.taux_tva > 0) lignes.push(`HT : ${fmt(doc.total_ht)} · TVA ${doc.taux_tva}%`);
    lignes.push(`TOTAL : ${fmt(doc.total_ttc)}`);
  }
  if (doc.type === "devis" && doc.validite) lignes.push(`Valable jusqu'au ${doc.validite}`);
  return lignes.join("\n");
};

export const envoyerDocumentWhatsApp = (doc, boutique) =>
  envoyerWhatsApp(doc.client_phone || "", texteDocument(doc, boutique));

export const envoyerDocumentSMS = (doc, boutique) =>
  envoyerSMS(doc.client_phone || "", texteDocument(doc, boutique));
