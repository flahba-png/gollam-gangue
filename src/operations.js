import { supabase } from "./supabase";
import { fmt, today, todayISO, heure } from "./theme";

// Cœur d'écriture des opérations métier (vente, crédit, réception stock, dépense).
// Extrait d'App.jsx : aucune dépendance à React, donc testable isolément.
// Renvoie { ok: true } ou { ok: false, err: "message lisible" }.
export const ecrireOperation = async (donnees, boutiqueId, monNom = "") => {
  const { action, nom, quantite, prixVente, prixAchat, montantDepense, isCredit, client, avance, modePaiement = "especes", clientPhone = "", paiements = null } = donnees;
  const uid = boutiqueId;
  const log = { boutique_id: uid, heure: heure(), date_iso: todayISO(), texte: "", type: action, montant: 0, benefice_etabli: 0, details_facture: null, mode_paiement: modePaiement, paiements: null, vendeur_nom: monNom };
  // Paiement mixte : on garde la répartition et on étiquette le mode
  if (paiements && typeof paiements === "object" && Object.keys(paiements).length) {
    log.paiements = paiements;
    const cles = Object.keys(paiements);
    log.mode_paiement = cles.length > 1 ? "mixte" : cles[0];
  }

  if (action === "vente") {
    // Panier multi-articles : compat avec l'ancien format mono-produit
    const lignesEntree = donnees.lignes || [{ nom, quantite, prixVente }];

    // 1. Validation : on résout et vérifie TOUT le stock avant d'écrire quoi que ce soit
    const resolues = [];
    for (const l of lignesEntree) {
      const { data: produit } = await supabase.from("produits").select("*").eq("boutique_id", uid).ilike("nom", l.nom).maybeSingle();
      if (!produit) return { ok: false, err: `"${l.nom}" introuvable dans le stock.` };
      if ((produit.stock || 0) < l.quantite) return { ok: false, err: `Stock insuffisant pour ${l.nom} (${produit.stock} dispo).` };
      const pu = l.prixVente || produit.prix_vente || 0;
      const coutReel = (produit.prix_achat || 0) + (produit.frais_unitaire || 0);
      resolues.push({ produit, qte: l.quantite, pu, total: pu * l.quantite, gain: (pu - coutReel) * l.quantite, nom: produit.nom });
    }

    const totalBrut = resolues.reduce((s, r) => s + r.total, 0);
    const gainBrut = resolues.reduce((s, r) => s + r.gain, 0);
    const remise = Math.min(donnees.remise || 0, totalBrut); // la remise sort de la marge
    const totalVente = totalBrut - remise;
    const gain = gainBrut - remise;
    const lignesFacture = resolues.map(r => ({ nom: r.nom, qte: r.qte, pu: r.pu, total: r.total }));
    const resume = resolues.map(r => `${r.qte}x ${r.nom}`).join(", ");
    const nbArticles = resolues.length;
    const reste = totalVente - avance;

    // 2. Plafond de crédit : on vérifie AVANT de toucher au stock
    if (isCredit) {
      const { data: pl } = await supabase.from("plafonds").select("plafond").eq("boutique_id", uid).ilike("client", client).maybeSingle();
      const plafond = pl?.plafond || 0;
      if (plafond > 0) {
        const { data: dettes } = await supabase.from("credits").select("reste_a_payer").eq("boutique_id", uid).ilike("client", client);
        const detteActuelle = (dettes || []).reduce((s, c) => s + (c.reste_a_payer || 0), 0);
        if (detteActuelle + reste > plafond) {
          return { ok: false, err: `Plafond dépassé pour ${client} : max ${fmt(plafond)}, déjà ${fmt(detteActuelle)} dû.` };
        }
      }
    }

    // 3. Écriture : on décrémente chaque produit
    for (const r of resolues) {
      await supabase.from("produits").update({ stock: r.produit.stock - r.qte }).eq("id", r.produit.id);
    }

    if (isCredit) {
      log.texte = `📉 [CRÉDIT] ${resume} → ${client}`;
      log.montant = avance;
      log.benefice_etabli = gain;
      log.details_facture = { client, clientPhone, article: resume, lignes: lignesFacture, remise, total: totalVente, reste, type: "Vente à Crédit" };
      await supabase.from("credits").insert({ boutique_id: uid, client, client_phone: clientPhone, article: resume, total: totalVente, avance, reste_a_payer: reste, date: today(), mode_paiement: modePaiement });
    } else {
      log.texte = nbArticles > 1 ? `🔴 Vente ${nbArticles} articles (${resume})` : `🔴 Vendu ${resume}`;
      log.montant = totalVente;
      log.benefice_etabli = gain;
      log.details_facture = { client: "Client Comptoir", article: resume, lignes: lignesFacture, remise, total: totalVente, reste: 0, type: "Vente Comptant" };
    }

  } else if (action === "depense") {
    log.texte = `💸 ${nom}`;
    log.montant = montantDepense || 0;
    // Qui a réellement pris l'argent (peut différer de celui qui saisit)
    if (donnees.beneficiaire) log.details_facture = { beneficiaire: donnees.beneficiaire };

  } else {
    const fId = donnees.fournisseurId || null;
    const { data: existant } = await supabase.from("produits").select("*").eq("boutique_id", uid).ilike("nom", nom).maybeSingle();
    if (existant) {
      await supabase.from("produits").update({
        stock: (existant.stock || 0) + quantite,
        ...(prixVente ? { prix_vente: prixVente } : {}),
        ...(prixAchat ? { prix_achat: prixAchat } : {}),
        ...(fId ? { fournisseur_id: fId } : {}),
      }).eq("id", existant.id);
    } else {
      await supabase.from("produits").insert({ boutique_id: uid, nom, prix_achat: prixAchat || 0, prix_vente: prixVente || 0, stock: quantite, fournisseur_id: fId });
    }
    log.texte = `🟢 Reçu +${quantite}x ${nom}`;
    log.montant = (prixVente || 0) * quantite;
  }

  await supabase.from("historique").insert(log);
  return { ok: true };
};
