import { fmt } from "./theme";

// Génère une affiche promo (image PNG 1080x1350) prête à partager en statut
// WhatsApp. Tout est dessiné sur un canvas dans le téléphone : zéro serveur.

const chargerImage = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

// Palette de l'affiche (fond sombre premium, vert Gollam)
const P = { fond: "#0C1016", bande: "#1FD08A", carte: "#161C24", texte: "#EAF0F6", vert: "#1FD08A", muted: "#8A97A6", sombre: "#0C1016" };

export const genererAffichePromo = async (promo, produits, boutique) => {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");

  // Fond
  ctx.fillStyle = P.fond;
  ctx.fillRect(0, 0, W, H);

  // En-tête : logo (ou initiale) + nom + ville
  const logo = await chargerImage(boutique?.logo);
  const cx = W / 2;
  if (logo) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, 150, 80, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "#fff"; ctx.fillRect(cx - 80, 70, 160, 160);
    const r = Math.max(160 / logo.width, 160 / logo.height);
    ctx.drawImage(logo, cx - (logo.width * r) / 2, 150 - (logo.height * r) / 2, logo.width * r, logo.height * r);
    ctx.restore();
  } else {
    ctx.beginPath(); ctx.arc(cx, 150, 80, 0, Math.PI * 2);
    ctx.fillStyle = P.bande; ctx.fill();
    ctx.fillStyle = P.sombre; ctx.font = "bold 80px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText((boutique?.nom || "G").charAt(0).toUpperCase(), cx, 158);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = P.texte; ctx.font = "bold 52px Arial";
  ctx.fillText(boutique?.nom || "Ma Boutique", cx, 300);
  ctx.fillStyle = P.muted; ctx.font = "30px Arial";
  ctx.fillText(boutique?.ville || "", cx, 345);

  // Bande centrale : -X% + dates
  ctx.fillStyle = P.bande;
  ctx.fillRect(0, 390, W, 260);
  ctx.fillStyle = P.sombre;
  ctx.font = "bold 44px Arial";
  ctx.fillText("PROMO", cx, 455);
  ctx.font = "bold 150px Arial";
  ctx.fillText(`-${promo.pourcentage}%`, cx, 585);
  const dates = promo.date_debut && promo.date_fin ? `du ${frDate(promo.date_debut)} au ${frDate(promo.date_fin)}` : "";
  ctx.font = "bold 34px Arial";
  ctx.fillText(dates, cx, 635);

  // Articles : ancien prix barré → prix promo (6 max)
  const noms = (promo.produits || []).slice(0, 6);
  let y = 730;
  ctx.font = "34px Arial";
  for (const nom of noms) {
    const p = produits.find(x => (x.nom || "").trim().toLowerCase() === (nom || "").trim().toLowerCase());
    const prix = p?.prix_vente || 0;
    const remise = Math.round(prix * (1 - promo.pourcentage / 100));

    ctx.fillStyle = P.carte;
    arrondi(ctx, 60, y - 44, W - 120, 66, 14); ctx.fill();

    ctx.textAlign = "left"; ctx.fillStyle = P.texte;
    ctx.fillText(tronque(ctx, nom, 520), 90, y);

    ctx.textAlign = "right";
    if (prix > 0) {
      ctx.fillStyle = P.muted;
      const ancien = fmt(prix);
      ctx.fillText(ancien, W - 260, y);
      const lw = ctx.measureText(ancien).width;
      ctx.strokeStyle = P.muted; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(W - 260 - lw, y - 11); ctx.lineTo(W - 260, y - 11); ctx.stroke();
      ctx.fillStyle = P.vert; ctx.font = "bold 34px Arial";
      ctx.fillText(fmt(remise), W - 90, y);
      ctx.font = "34px Arial";
    } else {
      ctx.fillStyle = P.vert; ctx.fillText(`-${promo.pourcentage}%`, W - 90, y);
    }
    ctx.textAlign = "center";
    y += 86;
  }
  if ((promo.produits || []).length > 6) {
    ctx.fillStyle = P.muted; ctx.font = "30px Arial";
    ctx.fillText(`… et ${(promo.produits || []).length - 6} autres articles`, cx, y);
    y += 60;
  }

  // Pied : où commander + signature
  ctx.fillStyle = P.carte;
  ctx.fillRect(0, H - 170, W, 170);
  ctx.fillStyle = P.texte; ctx.font = "bold 36px Arial";
  const contact = boutique?.infos_paiement || `Passez vite chez ${boutique?.nom || "nous"} !`;
  ctx.fillText(tronque(ctx, contact, W - 120), cx, H - 100);
  ctx.fillStyle = P.muted; ctx.font = "26px Arial";
  ctx.fillText("Géré avec Gollam", cx, H - 45);

  return c;
};

// Partage l'affiche via le menu natif du téléphone ; repli = téléchargement.
export const partagerAffiche = async (promo, produits, boutique, onStatut) => {
  try {
    const canvas = await genererAffichePromo(promo, produits, boutique);
    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    const fichier = new File([blob], `promo-${promo.pourcentage}pct.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: "Promo", text: `🎉 Promo -${promo.pourcentage}% chez ${boutique?.nom || ""} !` });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fichier.name; a.click();
      URL.revokeObjectURL(url);
      onStatut && onStatut("✅ Affiche téléchargée — partage-la en statut WhatsApp !");
    }
  } catch (e) {
    if (e?.name !== "AbortError") onStatut && onStatut("❌ Impossible de générer l'affiche. Réessaie.");
  }
};

// Lit une photo prise au téléphone et la compresse (max 900px, JPEG ~70%)
// pour un stockage léger en base. Renvoie une data URL.
export const compresserPhoto = (file, max = 900) => new Promise((resolve, reject) => {
  const lecteur = new FileReader();
  lecteur.onerror = reject;
  lecteur.onload = () => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.src = lecteur.result;
  };
  lecteur.readAsDataURL(file);
});

// Pub d'un article : sa photo en grand + prix + identité boutique (1080x1350)
export const genererPubArticle = async (produit, boutique) => {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const cx = W / 2;

  ctx.fillStyle = P.fond;
  ctx.fillRect(0, 0, W, H);

  // Photo de l'article : plein cadre en haut (recadrage type "cover")
  const photo = await chargerImage(produit?.photo);
  const zoneH = 760;
  if (photo) {
    const r = Math.max(W / photo.width, zoneH / photo.height);
    const sw = W / r, sh = zoneH / r;
    ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, 0, 0, W, zoneH);
  } else {
    ctx.fillStyle = P.carte;
    ctx.fillRect(0, 0, W, zoneH);
    ctx.fillStyle = P.muted; ctx.font = "bold 46px Arial";
    ctx.textAlign = "center";
    ctx.fillText("📦", cx, zoneH / 2);
  }
  // Badge boutique en haut de la photo
  ctx.fillStyle = "rgba(12,16,22,0.82)";
  arrondi(ctx, 40, 40, ctx.measureText(boutique?.nom || "") ? Math.min(W - 80, 60 + (boutique?.nom || "Ma Boutique").length * 22) : 400, 76, 38); ctx.fill();
  ctx.fillStyle = P.texte; ctx.font = "bold 36px Arial"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(tronque(ctx, boutique?.nom || "Ma Boutique", W - 160), 70, 80);
  ctx.textBaseline = "alphabetic";

  // Nom de l'article
  ctx.textAlign = "center";
  ctx.fillStyle = P.texte; ctx.font = "bold 56px Arial";
  ctx.fillText(tronque(ctx, produit?.nom || "", W - 120), cx, zoneH + 110);
  if (produit?.compatibilite) {
    ctx.fillStyle = P.muted; ctx.font = "32px Arial";
    ctx.fillText(tronque(ctx, `🚗 ${produit.compatibilite}`, W - 120), cx, zoneH + 165);
  }

  // Bande prix
  ctx.fillStyle = P.bande;
  ctx.fillRect(0, zoneH + 210, W, 170);
  ctx.fillStyle = P.sombre; ctx.font = "bold 40px Arial";
  ctx.fillText("PRIX", cx, zoneH + 275);
  ctx.font = "bold 92px Arial";
  ctx.fillText(fmt(produit?.prix_vente || 0), cx, zoneH + 360);

  // Pied : contact + signature
  ctx.fillStyle = P.carte;
  ctx.fillRect(0, H - 150, W, 150);
  ctx.fillStyle = P.texte; ctx.font = "bold 34px Arial";
  const contact = boutique?.infos_paiement || `Disponible chez ${boutique?.nom || "nous"} · ${boutique?.ville || ""}`;
  ctx.fillText(tronque(ctx, contact, W - 120), cx, H - 88);
  ctx.fillStyle = P.muted; ctx.font = "26px Arial";
  ctx.fillText("Géré avec Gollam", cx, H - 38);

  return c;
};

export const partagerPubArticle = async (produit, boutique, onStatut) => {
  try {
    const canvas = await genererPubArticle(produit, boutique);
    const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
    const fichier = new File([blob], `pub-${(produit?.nom || "article").replace(/\W+/g, "-")}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      await navigator.share({ files: [fichier], title: produit?.nom || "Article", text: `${produit?.nom} — ${fmt(produit?.prix_vente || 0)} chez ${boutique?.nom || ""}` });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fichier.name; a.click();
      URL.revokeObjectURL(url);
      onStatut && onStatut("✅ Pub téléchargée — partage-la en statut WhatsApp !");
    }
  } catch (e) {
    if (e?.name !== "AbortError") onStatut && onStatut("❌ Impossible de générer la pub. Réessaie.");
  }
};

// --- petits utilitaires de dessin ---
const frDate = (iso) => { try { const [, m, j] = iso.split("-"); return `${parseInt(j)}/${parseInt(m)}`; } catch { return iso; } };
const arrondi = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};
const tronque = (ctx, txt, maxW) => {
  let t = String(txt || "");
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
};
