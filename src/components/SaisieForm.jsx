import React, { useState } from "react";
import { C, fmt, MODES_PAIEMENT } from "../theme";
import { t } from "../i18n";
import Scanner from "./Scanner";
import ProduitSelect from "./ProduitSelect";

// Formulaire de saisie : panier multi-articles pour vente/crédit, simple pour stock/dépense
export default function SaisieForm({ produits, onSubmit, chargement, estEntrepot = false, fournisseurs = [] }) {
  const [type, setType] = useState(estEntrepot ? "ajout" : "vente"); // vente | ajout | depense | credit

  // Constructeur de ligne
  const [produitId, setProduitId] = useState("");
  const [nouveauNom, setNouveauNom] = useState("");
  const [quantite, setQuantite] = useState("1");
  const [prixUnit, setPrixUnit] = useState("");
  const [prixAchat, setPrixAchat] = useState("");
  const [fournisseurId, setFournisseurId] = useState("");

  // Panier (ventes/crédits)
  const [panier, setPanier] = useState([]);

  // Infos vente
  const [client, setClient] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [avance, setAvance] = useState("");
  const [remise, setRemise] = useState("");
  const [description, setDescription] = useState("");
  const [modePaiement, setModePaiement] = useState("especes");

  const [uniteSaisie, setUniteSaisie] = useState("piece"); // piece | carton (réception stock)
  const [scanOuvert, setScanOuvert] = useState(false);
  const [scanMsg, setScanMsg] = useState("");

  const estPanier = type === "vente" || type === "credit";
  const produitSel = produits.find(p => String(p.id) === String(produitId));

  const resetTout = () => {
    setProduitId(""); setNouveauNom(""); setQuantite("1"); setPrixUnit(""); setPrixAchat("");
    setPanier([]); setClient(""); setClientPhone(""); setAvance(""); setRemise(""); setDescription("");
    setModePaiement("especes"); setUniteSaisie("piece"); setFournisseurId("");
  };

  // Ajoute la ligne courante au panier
  const ajouterAuPanier = (prod, qte = 1, pu = null) => {
    const p = prod || produitSel;
    if (!p) { setScanMsg("⚠️ Choisis un produit."); return; }
    const q = parseInt(qte) || 1;
    const prix = pu != null ? pu : (parseInt(prixUnit) || p.prix_vente || 0);
    setPanier(prev => {
      // Fusionne si déjà présent
      const i = prev.findIndex(l => l.produitId === p.id);
      if (i >= 0) {
        const copie = [...prev];
        copie[i] = { ...copie[i], qte: copie[i].qte + q };
        return copie;
      }
      return [...prev, { produitId: p.id, nom: p.nom, qte: q, pu: prix, remise: 0, stock: p.stock || 0 }];
    });
    setProduitId(""); setQuantite("1"); setPrixUnit("");
  };

  const retirerLigne = (id) => setPanier(prev => prev.filter(l => l.produitId !== id));
  const majQte = (id, q) => setPanier(prev => prev.map(l => l.produitId === id ? { ...l, qte: Math.max(1, parseInt(q) || 1) } : l));
  const majRemise = (id, v) => setPanier(prev => prev.map(l => l.produitId === id ? { ...l, remise: Math.max(0, Math.min(parseInt(v) || 0, l.pu * l.qte)) } : l));

  const totalPanier = panier.reduce((s, l) => s + l.qte * l.pu, 0);
  const remiseF = panier.reduce((s, l) => s + (parseInt(l.remise) || 0), 0);
  const totalNet = totalPanier - remiseF;

  // Scan : ajoute au panier (vente/crédit) ou sélectionne (stock)
  const onScan = (code) => {
    setScanOuvert(false);
    const p = produits.find(x => x.code_barre && x.code_barre === code);
    if (!p) { setScanMsg(`❌ Code ${code} non reconnu. Associe-le dans l'onglet Stock.`); setTimeout(() => setScanMsg(""), 4000); return; }
    if (estPanier) { ajouterAuPanier(p, 1, p.prix_vente || 0); setScanMsg(`✅ ${p.nom} ajouté au panier`); }
    else { setProduitId(String(p.id)); setScanMsg(`✅ ${p.nom} sélectionné`); }
    setTimeout(() => setScanMsg(""), 3000);
  };

  const submit = (e) => {
    e.preventDefault();

    if (type === "depense") {
      if (!description.trim() || !prixUnit) return;
      onSubmit({ action: "depense", nom: description.trim(), montantDepense: parseInt(prixUnit) || 0, quantite: 1, prixAchat: 0, prixVente: 0, isCredit: false, client: "", avance: 0, modePaiement, clientPhone: "" });
      resetTout();
      return;
    }

    if (type === "ajout") {
      const nom = produitSel ? produitSel.nom : nouveauNom.trim();
      if (!nom) return;
      // Conversion carton → pièces si réception en cartons
      const facteur = (uniteSaisie === "carton" && produitSel?.unites_par_carton > 1) ? produitSel.unites_par_carton : 1;
      const qteBase = (parseInt(quantite) || 1) * facteur;
      onSubmit({ action: "ajout", nom, quantite: qteBase, prixAchat: parseInt(prixAchat) || 0, prixVente: parseInt(prixUnit) || 0, montantDepense: 0, isCredit: false, client: "", avance: 0, modePaiement: "especes", clientPhone: "", fournisseurId: fournisseurId || null });
      resetTout();
      return;
    }

    // vente / crédit : panier
    if (panier.length === 0) { setScanMsg("⚠️ Ajoute au moins un article au panier."); return; }
    if (totalPanier <= 0) { setScanMsg("⚠️ Le total est de 0 F — vérifie les prix."); return; }
    onSubmit({
      action: "vente",
      lignes: panier.map(l => ({ nom: l.nom, quantite: l.qte, prixVente: l.pu })),
      remise: remiseF,
      isCredit: type === "credit",
      client: client.trim() || (type === "credit" ? "Client Inconnu" : ""),
      clientPhone: clientPhone.trim(),
      avance: parseInt(avance) || 0,
      modePaiement,
    });
    resetTout();
  };

  const types = estEntrepot
    ? [{ id: "ajout", label: `🟢 ${t("reception_stock")}`, color: C.blue }]
    : [
        { id: "vente", label: `🔴 ${t("vente")}`, color: C.green },
        { id: "ajout", label: `🟢 ${t("stock")}`, color: C.blue },
        { id: "credit", label: `📒 ${t("credit")}`, color: C.yellow },
        { id: "depense", label: `💸 ${t("depense")}`, color: C.red },
      ];

  return (
    <form onSubmit={submit} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 14 }}>
      {scanOuvert && <Scanner onScan={onScan} onClose={() => setScanOuvert(false)} />}

      {/* TYPE */}
      <div style={{ display: "grid", gridTemplateColumns: estEntrepot ? "1fr" : "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 14 }}>
        {types.map(ty => (
          <button key={ty.id} type="button" onClick={() => { setType(ty.id); resetTout(); }}
            style={{ padding: "8px 4px", borderRadius: 8, fontSize: 11, fontWeight: "bold", cursor: "pointer",
              border: `1px solid ${type === ty.id ? ty.color : C.border}`,
              background: type === ty.id ? ty.color + "22" : "transparent",
              color: type === ty.id ? ty.color : C.muted }}>
            {ty.label}
          </button>
        ))}
      </div>

      {type === "depense" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={labelStyle}>DESCRIPTION</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Carburant, loyer..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>MONTANT (F)</label>
            <input type="number" inputMode="numeric" value={prixUnit} onChange={e => setPrixUnit(e.target.value)} placeholder="0" style={inputStyle} />
          </div>
        </div>
      ) : type === "ajout" ? (
        <>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>PRODUIT (existant ou nouveau)</label>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 1 }}>
                <ProduitSelect
                  produits={produits} value={produitId} autoriserNouveau
                  placeholder="Rechercher ou créer un produit..."
                  onSelect={p => { setProduitId(p ? String(p.id) : ""); setNouveauNom(""); }}
                  onNouveau={nom => { setProduitId(""); setNouveauNom(nom); }}
                />
              </div>
              <button type="button" onClick={() => setScanOuvert(true)} title="Scanner" style={scanBtn}>📷</button>
            </div>
            {!produitId && nouveauNom && (
              <div style={{ fontSize: 11, color: C.green, marginTop: 4 }}>➕ Nouveau produit : « {nouveauNom} »</div>
            )}
            {scanMsg && <div style={{ fontSize: 11, marginTop: 4, color: scanMsg.startsWith("✅") ? C.green : C.red }}>{scanMsg}</div>}
          </div>
          {!produitId && nouveauNom && (
            <div style={{ marginBottom: 10 }}>
              <input value={nouveauNom} onChange={e => setNouveauNom(e.target.value)} placeholder="Nom du nouveau produit..." style={inputStyle} />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div><label style={labelStyle}>{t("quantite").toUpperCase()}</label><input type="number" inputMode="numeric" min="1" value={quantite} onChange={e => setQuantite(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>{t("prix_achat").toUpperCase()}</label><input type="number" inputMode="numeric" value={prixAchat} onChange={e => setPrixAchat(e.target.value)} placeholder="0" style={inputStyle} /></div>
            <div><label style={labelStyle}>{t("prix_vente").toUpperCase()}</label><input type="number" inputMode="numeric" value={prixUnit} onChange={e => setPrixUnit(e.target.value)} placeholder="0" style={inputStyle} /></div>
          </div>
          {/* Source de l'achat (fournisseur) */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>🚚 FOURNISSEUR (source de l'achat)</label>
            <select value={fournisseurId} onChange={e => setFournisseurId(e.target.value)} style={inputStyle}>
              <option value="">— Aucun / inconnu —</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </div>
          {/* Carton ↔ pièce (produit existant avec conditionnement) */}
          {produitSel?.unites_par_carton > 1 && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>UNITÉ DE RÉCEPTION</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[{ id: "piece", label: "Pièce" }, { id: "carton", label: `Carton (×${produitSel.unites_par_carton})` }].map(u => (
                  <button key={u.id} type="button" onClick={() => setUniteSaisie(u.id)}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer",
                      border: `1px solid ${uniteSaisie === u.id ? C.blue : C.border}`,
                      background: uniteSaisie === u.id ? C.blue + "22" : "transparent",
                      color: uniteSaisie === u.id ? C.blue : C.muted }}>
                    {u.label}
                  </button>
                ))}
              </div>
              {uniteSaisie === "carton" && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4, textAlign: "right" }}>
                  = {(parseInt(quantite) || 0) * produitSel.unites_par_carton} pièces ajoutées
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* CONSTRUCTEUR DE LIGNE */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>AJOUTER UN ARTICLE</label>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 1 }}>
                <ProduitSelect
                  produits={produits} value=""
                  placeholder="Rechercher un produit à ajouter…"
                  onSelect={p => { if (p) { ajouterAuPanier(p, 1, p.prix_vente || 0); setScanMsg(`✅ ${p.nom} ajouté`); setTimeout(() => setScanMsg(""), 1500); } }}
                />
              </div>
              <button type="button" onClick={() => setScanOuvert(true)} title="Scanner" style={scanBtn}>📷</button>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Choisis un produit → il s'ajoute au panier (quantité modifiable ci-dessous).</div>
            {scanMsg && <div style={{ fontSize: 11, marginTop: 4, color: scanMsg.startsWith("✅") ? C.green : scanMsg.startsWith("⚠️") ? C.yellow : C.red }}>{scanMsg}</div>}
          </div>

          {/* PANIER */}
          <div style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}`, padding: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: "bold", marginBottom: 8 }}>🛒 PANIER ({panier.length})</div>
            {panier.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun article. Ajoute des produits ci-dessus.</div>}
            {panier.length > 0 && (
              <div style={{ display: "flex", gap: 6, fontSize: 9, color: C.muted, fontWeight: "bold", padding: "0 0 4px", letterSpacing: 0.3 }}>
                <span style={{ flex: 1 }}>ARTICLE</span>
                <span style={{ width: 46, textAlign: "center" }}>QTÉ</span>
                <span style={{ width: 74, textAlign: "center" }}>REMISE</span>
                <span style={{ width: 18 }} />
              </div>
            )}
            {panier.map(l => {
              const net = l.qte * l.pu - (parseInt(l.remise) || 0);
              return (
              <div key={l.produitId} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.nom}</div>
                  <div style={{ color: C.muted, fontSize: 10 }}>{fmt(l.pu)} × {l.qte}{(parseInt(l.remise) || 0) > 0 ? ` − ${fmt(l.remise)}` : ""} = <b style={{ color: C.green }}>{fmt(net)}</b></div>
                </div>
                <input type="number" min="1" value={l.qte} onChange={e => majQte(l.produitId, e.target.value)} title="Quantité"
                  style={{ width: 46, padding: "5px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, textAlign: "center" }} />
                <input type="number" min="0" value={l.remise} onChange={e => majRemise(l.produitId, e.target.value)} title="Remise sur cet article" placeholder="0"
                  style={{ width: 74, padding: "5px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: (parseInt(l.remise) || 0) > 0 ? C.yellow : C.text, fontSize: 12, textAlign: "right" }} />
                <button type="button" onClick={() => retirerLigne(l.produitId)} style={{ background: C.red + "22", color: C.red, border: `1px solid ${C.red}44`, padding: "4px 6px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>✕</button>
              </div>
            );})}
            {panier.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 14, fontWeight: "bold", color: C.text }}>
                <span>{remiseF > 0 ? `NET À PAYER (remise ${fmt(remiseF)})` : "TOTAL"}</span>
                <span style={{ color: C.green }}>{fmt(totalNet)}</span>
              </div>
            )}
          </div>

          {/* CRÉDIT : client + avance */}
          {type === "credit" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div><label style={labelStyle}>CLIENT</label><input value={client} onChange={e => setClient(e.target.value)} placeholder="Nom du client" style={inputStyle} /></div>
                <div><label style={labelStyle}>📱 TÉLÉPHONE</label><input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="07 00 00 00 00" style={inputStyle} /></div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>AVANCE VERSÉE (F)</label>
                <input type="number" inputMode="numeric" value={avance} onChange={e => setAvance(e.target.value)} placeholder="0" style={inputStyle} />
                {totalNet > 0 && avance && <div style={{ fontSize: 11, color: C.red, marginTop: 4, textAlign: "right" }}>Reste : {fmt(totalNet - (parseInt(avance) || 0))}</div>}
              </div>
            </>
          )}
        </>
      )}

      {/* MODE DE PAIEMENT (sauf ajout) */}
      {type !== "ajout" && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>{t("mode_paiement").toUpperCase()}{type === "credit" ? " (avance)" : ""}</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MODES_PAIEMENT.map(m => (
              <button key={m.id} type="button" onClick={() => setModePaiement(m.id)}
                style={{ flex: "1 1 30%", padding: "8px 4px", borderRadius: 8, fontSize: 11, fontWeight: "bold", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  border: `1px solid ${modePaiement === m.id ? m.color : C.border}`,
                  background: modePaiement === m.id ? m.color + "22" : "transparent",
                  color: modePaiement === m.id ? m.color : C.muted }}>
                <span>{m.emoji}</span> {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {(() => {
        const venteBloquee = estPanier && (panier.length === 0 || totalPanier <= 0);
        const off = chargement || venteBloquee;
        return (
          <button type="submit" disabled={off}
            style={{ width: "100%", padding: 12, marginTop: 4, background: off ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 14, cursor: off ? "not-allowed" : "pointer", opacity: venteBloquee ? 0.7 : 1 }}>
            {chargement ? "⏳..." : estPanier ? `✅ ${t("enregistrer_vente")}${totalPanier > 0 ? ` (${fmt(totalNet)})` : ""}` : `✅ ${t("enregistrer")}`}
          </button>
        );
      })()}
    </form>
  );
}

const labelStyle = { display: "block", fontSize: 9, color: "var(--muted)", fontWeight: "bold", letterSpacing: 0.5, marginBottom: 4 };
const inputStyle = { width: "100%", padding: "9px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, boxSizing: "border-box", outline: "none" };
const scanBtn = { flexShrink: 0, width: 44, background: "#4FB5FF22", color: "#4FB5FF", border: "1px solid #4FB5FF44", borderRadius: 8, fontSize: 18, cursor: "pointer" };
