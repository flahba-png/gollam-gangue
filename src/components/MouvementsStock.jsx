import React, { useState, useMemo } from "react";
import { C, fmt, heure, todayISO } from "../theme";
import { supabase } from "../supabase";
import { msgErreur } from "../erreurs";
import { ecrireOperation } from "../operations";
import ProduitSelect from "./ProduitSelect";

// Écrans dédiés Entrée / Sortie de stock.
// Principe repris des logiciels de gestion : saisie guidée (motif obligatoire),
// rappel du stock disponible en direct, et les 30 derniers mouvements affichés
// juste en dessous du formulaire.

export const MOTIFS_SORTIE = [
  { id: "casse", label: "Casse" },
  { id: "perte", label: "Perte" },
  { id: "vol", label: "Vol" },
  { id: "don", label: "Don / cadeau" },
  { id: "usage", label: "Usage personnel" },
  { id: "retour_fourn", label: "Retour fournisseur" },
  { id: "autre", label: "Autre" },
];

export default function MouvementsStock({ mode = "sortie", produits, historique = [], boutiqueId, fournisseurs = [], monNom, onRefresh, onStatut }) {
  const estSortie = mode === "sortie";
  const [produitSel, setProduitSel] = useState(null);
  const [nouveauNom, setNouveauNom] = useState("");
  const [quantite, setQuantite] = useState("1");
  const [motif, setMotif] = useState("casse");
  const [note, setNote] = useState("");
  const [prixAchat, setPrixAchat] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [fournisseurId, setFournisseurId] = useState("");
  const [unite, setUnite] = useState("piece");
  const [enCours, setEnCours] = useState(false);

  const qte = parseInt(quantite) || 0;
  const facteur = (unite === "carton" && produitSel?.unites_par_carton > 1) ? produitSel.unites_par_carton : 1;
  const qteReelle = qte * facteur;
  const stockActuel = produitSel?.stock || 0;
  const stockApres = estSortie ? stockActuel - qteReelle : stockActuel + qteReelle;
  const trop = estSortie && qteReelle > stockActuel;

  // Les 30 derniers mouvements du type affiché
  const derniers = useMemo(() => {
    const types = estSortie ? ["sortie"] : ["ajout"];
    return historique
      .filter(h => types.includes(h.type))
      .slice(0, 30);
  }, [historique, estSortie]);

  const reset = () => {
    setProduitSel(null); setNouveauNom(""); setQuantite("1"); setNote("");
    setPrixAchat(""); setPrixVente(""); setFournisseurId(""); setUnite("piece");
  };

  // ---- SORTIE : on trace d'abord, on décrémente ensuite ----
  const validerSortie = async () => {
    if (!produitSel) { onStatut("⚠️ Choisis un produit."); return; }
    if (qteReelle <= 0) { onStatut("⚠️ Quantité invalide."); return; }
    if (trop) { onStatut(`⚠️ Stock insuffisant : ${stockActuel} disponible(s).`); return; }
    setEnCours(true);

    const motifLabel = MOTIFS_SORTIE.find(m => m.id === motif)?.label || motif;
    const valeur = qteReelle * ((produitSel.prix_achat || 0) + (produitSel.frais_unitaire || 0));
    const ligne = {
      boutique_id: boutiqueId, heure: heure(), date_iso: todayISO(),
      texte: `📤 Sortie ${qteReelle}x ${produitSel.nom} (${motifLabel})${note.trim() ? ` — ${note.trim()}` : ""}`,
      montant: 0, benefice_etabli: 0, vendeur_nom: monNom,
      details_facture: { article: produitSel.nom, quantite: qteReelle, motif: motifLabel, note: note.trim() || null, valeur, type: "Sortie de stock" },
    };

    // Type « sortie » si la base le connaît, sinon repli sur « inventaire »
    let { error } = await supabase.from("historique").insert({ ...ligne, type: "sortie" });
    if (error) ({ error } = await supabase.from("historique").insert({ ...ligne, type: "inventaire" }));
    if (error) { setEnCours(false); onStatut(msgErreur(error, "La sortie")); return; }

    const { error: err2 } = await supabase.from("produits").update({ stock: stockActuel - qteReelle }).eq("id", produitSel.id);
    setEnCours(false);
    if (err2) { onStatut(msgErreur(err2, "La mise à jour du stock")); return; }

    onStatut(`✅ Sortie enregistrée : ${qteReelle}x ${produitSel.nom} (${motifLabel}) · valeur ${fmt(valeur)}`);
    reset();
    onRefresh();
  };

  // ---- ENTRÉE : on réutilise la logique de réception existante ----
  const validerEntree = async () => {
    const nom = produitSel ? produitSel.nom : nouveauNom.trim();
    if (!nom) { onStatut("⚠️ Choisis ou nomme un produit."); return; }
    if (qteReelle <= 0) { onStatut("⚠️ Quantité invalide."); return; }
    setEnCours(true);
    const { ok, err } = await ecrireOperation({
      action: "ajout", nom, quantite: qteReelle,
      prixAchat: parseInt(prixAchat) || 0, prixVente: parseInt(prixVente) || 0,
      montantDepense: 0, isCredit: false, client: "", avance: 0,
      modePaiement: "especes", clientPhone: "", fournisseurId: fournisseurId || null,
    }, boutiqueId, monNom);
    setEnCours(false);
    if (!ok) { onStatut(`❌ ${err}`); return; }
    onStatut(`✅ Entrée enregistrée : +${qteReelle}x ${nom}`);
    reset();
    onRefresh();
  };

  const couleur = estSortie ? C.red : C.green;

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {/* FORMULAIRE */}
      <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${couleur}55`, padding: 14, marginBottom: 12 }}>
        <div style={{ fontWeight: "bold", color: C.text, fontSize: 14, marginBottom: 10 }}>
          {estSortie ? "📤 Nouvelle sortie de stock" : "📥 Nouvelle entrée de stock"}
        </div>

        <label style={lbl}>PRODUIT</label>
        <ProduitSelect
          produits={produits} value={produitSel ? String(produitSel.id) : ""}
          autoriserNouveau={!estSortie}
          placeholder={estSortie ? "Quel produit sort du stock ?" : "Produit reçu…"}
          onSelect={p => { setProduitSel(p); setNouveauNom(""); if (p && !estSortie) { setPrixAchat(String(p.prix_achat || "")); setPrixVente(String(p.prix_vente || "")); } }}
          onNouveau={n => { setProduitSel(null); setNouveauNom(n); }}
        />
        {!estSortie && !produitSel && nouveauNom && (
          <div style={{ fontSize: 11, color: C.green, marginTop: 4 }}>➕ Nouveau produit : « {nouveauNom} »</div>
        )}

        {/* Rappel du stock en direct */}
        {produitSel && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: C.surface2, borderRadius: 8, padding: "8px 10px", marginTop: 8, fontSize: 12 }}>
            <span style={{ color: C.muted }}>Stock actuel</span>
            <span style={{ color: C.text, fontWeight: "bold" }}>
              {stockActuel} u
              {qteReelle > 0 && (
                <span style={{ color: trop ? C.red : couleur }}> → {stockApres} u</span>
              )}
            </span>
          </div>
        )}
        {trop && <div style={{ color: C.red, fontSize: 11, marginTop: 6, fontWeight: "bold" }}>⚠️ Tu ne peux pas sortir plus que le stock disponible.</div>}

        {/* Quantité (+ carton si applicable) */}
        <div style={{ display: "grid", gridTemplateColumns: produitSel?.unites_par_carton > 1 ? "1fr 1fr" : "1fr", gap: 8, marginTop: 10 }}>
          <div>
            <label style={lbl}>QUANTITÉ</label>
            <input type="number" inputMode="numeric" min="1" value={quantite} onChange={e => setQuantite(e.target.value)} style={inp} />
          </div>
          {produitSel?.unites_par_carton > 1 && (
            <div>
              <label style={lbl}>UNITÉ</label>
              <select value={unite} onChange={e => setUnite(e.target.value)} style={inp}>
                <option value="piece">Pièce</option>
                <option value="carton">Carton (×{produitSel.unites_par_carton})</option>
              </select>
            </div>
          )}
        </div>

        {estSortie ? (
          <>
            <label style={{ ...lbl, marginTop: 10 }}>MOTIF *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {MOTIFS_SORTIE.map(m => (
                <button key={m.id} type="button" onClick={() => setMotif(m.id)}
                  style={{ padding: "7px 12px", borderRadius: 14, fontSize: 12, fontWeight: "bold", cursor: "pointer",
                    border: `1px solid ${motif === m.id ? C.red : C.border}`,
                    background: motif === m.id ? C.red + "22" : "transparent",
                    color: motif === m.id ? C.red : C.muted }}>
                  {m.label}
                </button>
              ))}
            </div>
            <label style={{ ...lbl, marginTop: 10 }}>NOTE (facultatif)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Ex: tombé pendant le déchargement" style={{ ...inp, width: "100%" }} />
          </>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
              <div><label style={lbl}>PRIX D'ACHAT</label><input type="number" inputMode="numeric" value={prixAchat} onChange={e => setPrixAchat(e.target.value)} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>PRIX DE VENTE</label><input type="number" inputMode="numeric" value={prixVente} onChange={e => setPrixVente(e.target.value)} placeholder="0" style={inp} /></div>
            </div>
            <label style={{ ...lbl, marginTop: 10 }}>🚚 FOURNISSEUR</label>
            <select value={fournisseurId} onChange={e => setFournisseurId(e.target.value)} style={{ ...inp, width: "100%" }}>
              <option value="">— Aucun / inconnu —</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </>
        )}

        <button onClick={estSortie ? validerSortie : validerEntree} disabled={enCours || trop}
          style={{ width: "100%", padding: 13, marginTop: 14, background: (enCours || trop) ? C.muted : couleur, color: estSortie ? "#fff" : C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 15, cursor: (enCours || trop) ? "not-allowed" : "pointer" }}>
          {enCours ? "..." : estSortie ? "Valider la sortie" : "Valider l'entrée"}
        </button>
      </div>

      {/* LES 30 DERNIERS MOUVEMENTS, JUSTE EN DESSOUS */}
      <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>
          {estSortie ? "📤 30 DERNIÈRES SORTIES" : "📥 30 DERNIÈRES ENTRÉES"} ({derniers.length})
        </div>
        {derniers.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun mouvement pour l'instant.</div>}
        {derniers.map(h => (
          <div key={h.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 12 }}>{h.texte}</div>
                <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                  {h.date_iso} · {h.heure}
                  {h.vendeur_nom && <span style={{ color: couleur, fontWeight: "bold" }}> · 👤 {h.vendeur_nom}</span>}
                </div>
              </div>
              {h.details_facture?.valeur > 0 && (
                <span style={{ color: C.red, fontSize: 12, fontWeight: "bold", flexShrink: 0 }}>−{fmt(h.details_facture.valeur)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inp = { padding: "10px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, boxSizing: "border-box", width: "100%" };
const lbl = { display: "block", fontSize: 9, color: "var(--muted)", fontWeight: "bold", letterSpacing: 0.5, marginBottom: 4 };
