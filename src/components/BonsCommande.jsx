import React, { useState, useEffect, useCallback, useMemo } from "react";
import { C, fmt, today, todayISO } from "../theme";
import { supabase } from "../supabase";
import ProduitSelect from "./ProduitSelect";
import { msgErreur } from "../erreurs";
import { estIndisponible, estLocal, lireLocal, ajouterLocal, majLocal, fusionnerLocal } from "../fallback";

// Bons de commande d'achat : en-tête (fournisseur, prévu le) + lignes (article, qté, prix),
// avec réception (totale ou partielle) qui ajoute au stock.
const ilyaJours = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split("T")[0]; };

export default function BonsCommande({ produits, fournisseurs = [], boutiqueId, monNom, onRefresh, onStatut }) {
  const [bons, setBons] = useState([]);
  const [dDebut, setDDebut] = useState(ilyaJours(30));
  const [dFin, setDFin] = useState(todayISO());
  const [fFiltre, setFFiltre] = useState("tous");
  const [creation, setCreation] = useState(false);
  const [receptionId, setReceptionId] = useState(null);
  const [recQtes, setRecQtes] = useState({});

  // Form création
  const [fournisseurId, setFournisseurId] = useState("");
  const [prevuLe, setPrevuLe] = useState(todayISO());
  const [lignes, setLignes] = useState([]);
  const [qte, setQte] = useState("1");
  const [prix, setPrix] = useState("");
  const [selProduit, setSelProduit] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    if (!boutiqueId) { setBons([]); return; }
    const cle = `bons_commande_${boutiqueId}`;
    const { data, error } = await supabase.from("bons_commande").select("*").eq("boutique_id", boutiqueId)
      .gte("date", dDebut).lte("date", dFin).order("created_at", { ascending: false });
    if (error) { setBons(estIndisponible(error) ? lireLocal(cle) : []); return; }
    setBons(fusionnerLocal(cle, data));
  }, [boutiqueId, dDebut, dFin]);
  useEffect(() => { charger(); }, [charger]);

  const filtres = useMemo(() => bons.filter(b => fFiltre === "tous" || String(b.fournisseur_id) === fFiltre), [bons, fFiltre]);

  const totalForm = lignes.reduce((s, l) => s + l.qte * l.prix, 0);
  const ajouterLigne = () => {
    if (!selProduit) { onStatut && onStatut("⚠️ Choisis un article."); return; }
    const q = parseInt(qte) || 1, p = parseInt(prix) || selProduit.prix_achat || 0;
    setLignes(prev => {
      const i = prev.findIndex(l => l.nom.toLowerCase() === selProduit.nom.toLowerCase());
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], qte: c[i].qte + q }; return c; }
      return [...prev, { nom: selProduit.nom, qte: q, prix: p, qte_recue: 0 }];
    });
    setSelProduit(null); setQte("1"); setPrix("");
  };
  const retirerLigne = (nom) => setLignes(prev => prev.filter(l => l.nom !== nom));

  const enregistrer = async () => {
    if (lignes.length === 0) { onStatut && onStatut("⚠️ Ajoute au moins un article."); return; }
    setEnCours(true);
    const f = fournisseurs.find(x => String(x.id) === fournisseurId);
    const row = {
      boutique_id: boutiqueId, fournisseur_id: fournisseurId || null, fournisseur_nom: f?.nom || "—",
      date: todayISO(), prevu_le: prevuLe, statut: "en_attente", montant: totalForm, lignes, cree_par: monNom,
    };
    const { error } = await supabase.from("bons_commande").insert(row);
    setEnCours(false);
    if (error && !estIndisponible(error)) { onStatut && onStatut(msgErreur(error)); return; }
    // Table absente ou hors-ligne : on garde le bon en local, il reste utilisable.
    if (error) ajouterLocal(`bons_commande_${boutiqueId}`, row);
    setCreation(false); setLignes([]); setFournisseurId(""); setPrevuLe(todayISO());
    onStatut && onStatut("✅ Bon de commande créé.");
    charger();
  };

  // Réception : ajoute au stock les quantités reçues, met à jour le statut
  const ouvrirReception = (b) => {
    setReceptionId(b.id);
    const init = {};
    (b.lignes || []).forEach((l, i) => { init[i] = Math.max(0, (l.qte || 0) - (l.qte_recue || 0)); });
    setRecQtes(init);
  };
  const validerReception = async (b) => {
    const nouvellesLignes = [];
    for (let i = 0; i < (b.lignes || []).length; i++) {
      const l = b.lignes[i];
      const recu = Math.min(parseInt(recQtes[i]) || 0, (l.qte || 0) - (l.qte_recue || 0));
      if (recu > 0) {
        const { data: prod } = await supabase.from("produits").select("id, stock").eq("boutique_id", boutiqueId).ilike("nom", l.nom).maybeSingle();
        if (prod) await supabase.from("produits").update({ stock: (prod.stock || 0) + recu, ...(l.prix ? { prix_achat: l.prix } : {}) }).eq("id", prod.id);
        else await supabase.from("produits").insert({ boutique_id: boutiqueId, nom: l.nom, prix_achat: l.prix || 0, prix_vente: 0, stock: recu });
      }
      nouvellesLignes.push({ ...l, qte_recue: (l.qte_recue || 0) + recu });
    }
    const toutRecu = nouvellesLignes.every(l => (l.qte_recue || 0) >= (l.qte || 0));
    const partiel = nouvellesLignes.some(l => (l.qte_recue || 0) > 0);
    const maj = { lignes: nouvellesLignes, statut: toutRecu ? "recu" : partiel ? "recu_partiel" : "en_attente" };
    if (estLocal(b.id)) majLocal(`bons_commande_${boutiqueId}`, b.id, maj);
    else {
      const { error } = await supabase.from("bons_commande").update(maj).eq("id", b.id);
      if (error && estIndisponible(error)) majLocal(`bons_commande_${boutiqueId}`, b.id, maj);
    }
    setReceptionId(null); setRecQtes({});
    onStatut && onStatut("✅ Réception enregistrée, stock mis à jour.");
    onRefresh && onRefresh();
    charger();
  };

  const badge = (s) => {
    const m = { en_attente: { c: C.yellow, t: "En attente" }, recu_partiel: { c: C.blue, t: "Reçu partiel" }, recu: { c: C.green, t: "Reçu ✅" } }[s] || { c: C.muted, t: s };
    return <span style={{ background: m.c + "22", color: m.c, border: `1px solid ${m.c}55`, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>{m.t}</span>;
  };
  const recuTexte = (b) => { const q = (b.lignes || []).reduce((s, l) => s + (l.qte || 0), 0); const r = (b.lignes || []).reduce((s, l) => s + (l.qte_recue || 0), 0); return `${r}/${q}`; };

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {/* FILTRES */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 12, marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="date" value={dDebut} onChange={e => setDDebut(e.target.value)} style={inp} />
        <input type="date" value={dFin} onChange={e => setDFin(e.target.value)} style={inp} />
        <select value={fFiltre} onChange={e => setFFiltre(e.target.value)} style={{ ...inp, flex: 1 }}>
          <option value="tous">Tous les fournisseurs</option>
          {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
        </select>
      </div>

      {!creation ? (
        <button onClick={() => setCreation(true)} style={{ width: "100%", padding: 11, marginBottom: 12, background: C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
          + Créer un bon de commande d'achat
        </button>
      ) : (
        <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.green}55`, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", color: C.text, fontSize: 13, marginBottom: 10 }}>📝 Nouveau bon de commande</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div><label style={lbl}>FOURNISSEUR</label>
              <select value={fournisseurId} onChange={e => setFournisseurId(e.target.value)} style={inp}>
                <option value="">— Choisir —</option>
                {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
            <div><label style={lbl}>PRÉVU LE</label><input type="date" value={prevuLe} onChange={e => setPrevuLe(e.target.value)} style={inp} /></div>
          </div>
          <label style={lbl}>AJOUTER UN ARTICLE</label>
          <ProduitSelect produits={produits} value={selProduit ? String(selProduit.id) : ""} autoriserNouveau
            placeholder="Article à commander…"
            onSelect={p => { setSelProduit(p); if (p) setPrix(String(p.prix_achat || "")); }}
            onNouveau={nom => setSelProduit({ id: "new_" + nom, nom, prix_achat: 0 })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, margin: "8px 0", alignItems: "end" }}>
            <div><label style={lbl}>QTÉ</label><input type="number" min="1" value={qte} onChange={e => setQte(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>PRIX ACHAT</label><input type="number" value={prix} onChange={e => setPrix(e.target.value)} placeholder="0" style={inp} /></div>
            <button onClick={ajouterLigne} style={{ padding: "9px 12px", background: C.green + "22", color: C.green, border: `1px solid ${C.green}55`, borderRadius: 8, fontWeight: "bold", cursor: "pointer", fontSize: 13 }}>+ </button>
          </div>
          {lignes.map(l => (
            <div key={l.nom} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
              <span style={{ color: C.text }}>{l.qte}× {l.nom} <span style={{ color: C.muted }}>@ {fmt(l.prix)}</span></span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}><b style={{ color: C.green }}>{fmt(l.qte * l.prix)}</b>
                <button onClick={() => retirerLigne(l.nom)} aria-label="Retirer la ligne" style={{ background: C.red + "22", color: C.red, border: "none", borderRadius: 8, padding: "8px 11px", fontSize: 13, cursor: "pointer" }}>✕</button></span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", margin: "10px 0", fontWeight: "bold", color: C.text }}>
            <span>TOTAL</span><span style={{ color: C.green }}>{fmt(totalForm)}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setCreation(false); setLignes([]); }} style={{ padding: "10px 14px", background: C.surface2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Annuler</button>
            <button onClick={enregistrer} disabled={enCours} style={{ flex: 1, padding: 10, background: enCours ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 14, cursor: "pointer" }}>{enCours ? "..." : "Enregistrer le bon"}</button>
          </div>
        </div>
      )}

      {/* LISTE */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>📋 BONS DE COMMANDE ({filtres.length})</div>
        {filtres.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun bon de commande sur la période.</div>}
        {filtres.map(b => (
          <div key={b.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ color: C.text, fontSize: 13, fontWeight: "bold" }}>{b.fournisseur_nom || "—"}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>Créé {b.date} · Prévu {b.prevu_le || "—"} · Reçu {recuTexte(b)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: C.green, fontWeight: "bold", fontSize: 13 }}>{fmt(b.montant)}</div>
                <div style={{ marginTop: 3 }}>{badge(b.statut)}</div>
              </div>
            </div>
            {b.statut !== "recu" && (
              <button onClick={() => receptionId === b.id ? setReceptionId(null) : ouvrirReception(b)}
                style={{ marginTop: 8, background: C.blue + "18", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: "bold", cursor: "pointer" }}>
                📦 Réceptionner
              </button>
            )}
            {receptionId === b.id && (
              <div style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.blue}44`, padding: 10, marginTop: 8 }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: "bold", marginBottom: 6 }}>QUANTITÉS REÇUES</div>
                {(b.lignes || []).map((l, i) => {
                  const restant = (l.qte || 0) - (l.qte_recue || 0);
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                      <span style={{ color: C.text, fontSize: 12 }}>{l.nom} <span style={{ color: C.muted, fontSize: 10 }}>(reste {restant})</span></span>
                      <input type="number" min="0" max={restant} value={recQtes[i] ?? restant}
                        onChange={e => setRecQtes(p => ({ ...p, [i]: e.target.value }))}
                        style={{ width: 56, padding: "4px 6px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, textAlign: "center" }} disabled={restant <= 0} />
                    </div>
                  );
                })}
                <button onClick={() => validerReception(b)} style={{ width: "100%", marginTop: 8, padding: "8px 0", background: C.green, color: C.bg, border: "none", borderRadius: 6, fontWeight: "bold", fontSize: 12, cursor: "pointer" }}>
                  Valider la réception (ajoute au stock)
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const inp = { padding: "8px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 12, boxSizing: "border-box" };
const lbl = { display: "block", fontSize: 9, color: "var(--muted)", fontWeight: "bold", letterSpacing: 0.5, marginBottom: 4 };
