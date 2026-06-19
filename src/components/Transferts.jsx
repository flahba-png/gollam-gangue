import React, { useState } from "react";
import { C, today, heure, todayISO } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";

// Enregistre un mouvement de stock dans l'historique d'un lieu
const logMouvement = (boutiqueId, texte) =>
  supabase.from("historique").insert({
    boutique_id: boutiqueId, heure: heure(), date_iso: todayISO(),
    texte, type: "transfert", montant: 0, benefice_etabli: 0,
  });

export default function Transferts({ produits, boutiques, active, proprietaireId, transferts, onRefresh, onStatut }) {
  const [produitId, setProduitId] = useState("");
  const [destId, setDestId] = useState("");
  const [quantite, setQuantite] = useState("1");
  const [enCours, setEnCours] = useState(false);

  const autresLieux = boutiques.filter(b => b.id !== active?.id);
  const produitSel = produits.find(p => String(p.id) === String(produitId));

  const nomLieu = (id) => boutiques.find(b => b.id === id)?.nom || "?";

  // Transferts concernant la boutique active
  const recusEnAttente = transferts.filter(t => t.dest_id === active?.id && t.statut === "en_attente");
  const envoyes = transferts.filter(t => t.source_id === active?.id).slice(0, 10);

  // Envoyer un transfert : déduit le stock de la source immédiatement
  const envoyer = async () => {
    if (!produitSel || !destId) { onStatut("⚠️ Choisis un produit et une destination."); return; }
    const qte = parseInt(quantite) || 0;
    if (qte <= 0) { onStatut("⚠️ Quantité invalide."); return; }
    if (qte > (produitSel.stock || 0)) { onStatut(`⚠️ Stock insuffisant (${produitSel.stock} u).`); return; }

    setEnCours(true);
    await supabase.from("produits").update({ stock: produitSel.stock - qte }).eq("id", produitSel.id);
    await supabase.from("transferts").insert({
      proprietaire_id: proprietaireId,
      source_id: active.id,
      dest_id: destId,
      produit_nom: produitSel.nom,
      prix_achat: produitSel.prix_achat || 0,
      prix_vente: produitSel.prix_vente || 0,
      quantite: qte,
      statut: "en_attente",
      date_envoi: today(),
    });
    await logMouvement(active.id, `📤 Sortie ${qte}x ${produitSel.nom} → ${nomLieu(destId)}`);
    setEnCours(false);
    setProduitId(""); setDestId(""); setQuantite("1");
    onStatut(`✅ Transfert envoyé vers ${nomLieu(destId)} (en attente de réception).`);
    onRefresh();
  };

  // Valider la réception : ajoute le stock à la destination
  const valider = async (t) => {
    const { data: existant } = await supabase.from("produits")
      .select("*").eq("boutique_id", t.dest_id).ilike("nom", t.produit_nom).maybeSingle();

    if (existant) {
      await supabase.from("produits").update({ stock: (existant.stock || 0) + t.quantite }).eq("id", existant.id);
    } else {
      await supabase.from("produits").insert({
        boutique_id: t.dest_id, nom: t.produit_nom,
        prix_achat: t.prix_achat, prix_vente: t.prix_vente, stock: t.quantite,
      });
    }
    await supabase.from("transferts").update({ statut: "recu" }).eq("id", t.id);
    await logMouvement(t.dest_id, `📥 Entrée ${t.quantite}x ${t.produit_nom} ← ${nomLieu(t.source_id)}`);
    onStatut(`✅ ${t.quantite}x ${t.produit_nom} reçu et ajouté au stock.`);
    onRefresh();
  };

  // Refuser : on rend le stock à la source
  const refuser = async (t) => {
    if (!confirm(`Refuser le transfert de ${t.quantite}x ${t.produit_nom} ? Le stock sera rendu à l'expéditeur.`)) return;
    const { data: source } = await supabase.from("produits")
      .select("*").eq("boutique_id", t.source_id).ilike("nom", t.produit_nom).maybeSingle();
    if (source) {
      await supabase.from("produits").update({ stock: (source.stock || 0) + t.quantite }).eq("id", source.id);
    } else {
      await supabase.from("produits").insert({
        boutique_id: t.source_id, nom: t.produit_nom,
        prix_achat: t.prix_achat, prix_vente: t.prix_vente, stock: t.quantite,
      });
    }
    await supabase.from("transferts").update({ statut: "annule" }).eq("id", t.id);
    await logMouvement(t.source_id, `↩️ Retour ${t.quantite}x ${t.produit_nom} (refusé par ${nomLieu(t.dest_id)})`);
    onStatut("↩️ Transfert refusé. Stock rendu à l'expéditeur.");
    onRefresh();
  };

  const badge = (statut) => {
    const map = {
      en_attente: { c: C.yellow, t: "En attente" },
      recu: { c: C.green, t: "Reçu ✅" },
      annule: { c: C.red, t: "Refusé" },
    }[statut] || { c: C.muted, t: statut };
    return <span style={{ background: map.c + "22", color: map.c, border: `1px solid ${map.c}55`, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>{map.t}</span>;
  };

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {autresLieux.length === 0 ? (
        <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
          Tu n'as qu'un seul lieu. Crée une 2ᵉ boutique ou un entrepôt (menu en haut) pour transférer du stock.
        </div>
      ) : (
        <>
          {/* RÉCEPTIONS EN ATTENTE */}
          {recusEnAttente.length > 0 && (
            <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.yellow}55`, padding: 14, marginBottom: 12 }}>
              <div style={{ color: C.yellow, fontWeight: "bold", fontSize: 12, marginBottom: 10 }}>
                📥 {t("a_receptionner").toUpperCase()} ({recusEnAttente.length})
              </div>
              {recusEnAttente.map(t => (
                <div key={t.id} style={{ background: C.surface2, borderRadius: 8, padding: 12, marginBottom: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: "bold" }}>{t.quantite}x {t.produit_nom}</div>
                  <div style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>De : {nomLieu(t.source_id)} · {t.date_envoi}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => valider(t)}
                      style={{ flex: 1, padding: "7px 0", background: C.green, color: C.bg, border: "none", borderRadius: 6, fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>
                      ✅ Valider la réception
                    </button>
                    <button onClick={() => refuser(t)}
                      style={{ padding: "7px 12px", background: C.red + "22", color: C.red, border: `1px solid ${C.red}44`, borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                      Refuser
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* NOUVEAU TRANSFERT */}
          <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
            <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>🔄 {t("envoyer_transfert").toUpperCase()}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <select value={produitId} onChange={e => setProduitId(e.target.value)} style={selStyle}>
                <option value="">— Produit à transférer —</option>
                {produits.filter(p => (p.stock || 0) > 0).map(p => (
                  <option key={p.id} value={p.id}>{p.nom} (stock: {p.stock})</option>
                ))}
              </select>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input type="number" inputMode="numeric" min="1" value={quantite}
                  onChange={e => setQuantite(e.target.value)} placeholder="Quantité" style={selStyle} />
                <select value={destId} onChange={e => setDestId(e.target.value)} style={selStyle}>
                  <option value="">— Destination —</option>
                  {autresLieux.map(b => (
                    <option key={b.id} value={b.id}>{b.type === "entrepot" ? "🏬" : "🏪"} {b.nom}</option>
                  ))}
                </select>
              </div>
              <button onClick={envoyer} disabled={enCours}
                style={{ padding: 11, background: enCours ? C.muted : C.blue, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: enCours ? "not-allowed" : "pointer" }}>
                {enCours ? "⏳ Envoi..." : "📤 Envoyer le transfert"}
              </button>
            </div>
          </div>

          {/* HISTORIQUE DES ENVOIS */}
          <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
            <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>📤 {t("mes_envois").toUpperCase()}</div>
            {envoyes.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun transfert envoyé.</div>}
            {envoyes.map(t => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                <div>
                  <div style={{ color: C.text }}>{t.quantite}x {t.produit_nom}</div>
                  <div style={{ color: C.muted, fontSize: 10 }}>→ {nomLieu(t.dest_id)} · {t.date_envoi}</div>
                </div>
                {badge(t.statut)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const selStyle = {
  width: "100%", padding: "9px 12px", background: C.surface2,
  border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
  fontSize: 13, boxSizing: "border-box", outline: "none",
};
