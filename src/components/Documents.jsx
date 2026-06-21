import React, { useState, useEffect, useCallback, useMemo } from "react";
import { C, fmt, today } from "../theme";
import { supabase } from "../supabase";
import { imprimerDocument, envoyerDocumentWhatsApp, envoyerDocumentSMS, LIBELLE_DOC } from "../documents";
import { t } from "../i18n";

const PREFIX = { devis: "DEV", facture: "FAC", bon_livraison: "BL" };

export default function Documents({ produits, boutiqueActive, boutique, credits = [], historique = [], onStatut, prefill, onPrefillDone }) {
  const TYPES = [
    { id: "devis", label: `📝 ${t("devis")}` },
    { id: "facture", label: `🧾 ${t("facture")}` },
    { id: "bon_livraison", label: `🚚 ${t("bon_livr")}` },
  ];
  const [type, setType] = useState("facture");
  const [creation, setCreation] = useState(false);
  const [docs, setDocs] = useState([]);

  // Form
  const [client, setClient] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [lignes, setLignes] = useState([]);
  const [produitId, setProduitId] = useState("");
  const [libreNom, setLibreNom] = useState("");
  const [qte, setQte] = useState("1");
  const [pu, setPu] = useState("");
  const [remise, setRemise] = useState("");
  const [validite, setValidite] = useState("");
  const [notes, setNotes] = useState("");
  const [enCours, setEnCours] = useState(false);

  const tauxTva = parseFloat(boutiqueActive?.taux_tva) || 0;

  // Clients connus (crédits + ventes nominatives + documents existants)
  const clientsConnus = useMemo(() => {
    const map = new Map();
    const add = (nom, phone) => {
      if (!nom || nom === "Client Comptoir" || nom === "Client") return;
      const k = nom.trim().toLowerCase();
      if (!map.has(k)) map.set(k, { nom: nom.trim(), phone: phone || "" });
      else if (phone && !map.get(k).phone) map.get(k).phone = phone;
    };
    credits.forEach(c => add(c.client, c.client_phone));
    historique.forEach(h => add(h.details_facture?.client, h.details_facture?.clientPhone));
    docs.forEach(d => add(d.client, d.client_phone));
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [credits, historique, docs]);

  const charger = useCallback(async () => {
    if (!boutiqueActive) return;
    const { data } = await supabase.from("documents").select("*").eq("boutique_id", boutiqueActive.id).order("created_at", { ascending: false });
    setDocs(data || []);
  }, [boutiqueActive]);

  useEffect(() => { charger(); }, [charger]);

  // Préremplissage depuis un autre écran (ex: bouton Devis du Suivi Client)
  useEffect(() => {
    if (!prefill) return;
    if (prefill.type) setType(prefill.type);
    if (prefill.client) setClient(prefill.client);
    if (prefill.phone) setClientPhone(prefill.phone);
    setCreation(true);
    onPrefillDone && onPrefillDone();
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setClient(""); setClientPhone(""); setLignes([]); setProduitId(""); setLibreNom(""); setQte("1"); setPu(""); setRemise(""); setValidite(""); setNotes(""); };

  const ajouterLigne = () => {
    const prod = produits.find(p => String(p.id) === String(produitId));
    const nom = prod ? prod.nom : libreNom.trim();
    if (!nom) { onStatut("⚠️ Choisis un produit ou tape un nom."); return; }
    const q = parseInt(qte) || 1;
    const prix = parseInt(pu) || (prod?.prix_vente || 0);
    setLignes(prev => [...prev, { nom, qte: q, pu: prix }]);
    setProduitId(""); setLibreNom(""); setQte("1"); setPu("");
  };

  const sousTotal = lignes.reduce((s, l) => s + l.qte * l.pu, 0);
  const remiseF = Math.min(parseInt(remise) || 0, sousTotal);
  const ht = sousTotal - remiseF;
  const tvaF = Math.round(ht * tauxTva / 100);
  const ttc = ht + tvaF;

  const enregistrer = async () => {
    if (lignes.length === 0) { onStatut("⚠️ Ajoute au moins une ligne."); return; }
    setEnCours(true);
    const { count } = await supabase.from("documents").select("*", { count: "exact", head: true }).eq("boutique_id", boutiqueActive.id).eq("type", type);
    const numero = `${PREFIX[type]}-${String((count || 0) + 1).padStart(4, "0")}`;
    const { data } = await supabase.from("documents").insert({
      boutique_id: boutiqueActive.id, type, numero,
      client: client.trim() || "Client", client_phone: clientPhone.trim(),
      lignes, remise: remiseF, taux_tva: tauxTva,
      total_ht: ht, total_ttc: ttc,
      statut: type === "devis" ? "en_attente" : type === "facture" ? "impayee" : "a_livrer",
      date: today(), validite: validite || null, notes: notes.trim() || null,
    }).select().single();
    setEnCours(false);
    reset(); setCreation(false);
    onStatut(`✅ ${LIBELLE_DOC[type]} ${numero} créé.`);
    charger();
    if (data) imprimerDocument(data, boutique);
  };

  const changerStatut = async (doc, statut) => {
    await supabase.from("documents").update({ statut }).eq("id", doc.id);
    charger();
  };

  // Transforme un document en un autre type (devis→facture/bon, bon→facture, facture→bon…)
  const convertir = async (doc, nouveauType) => {
    const { count } = await supabase.from("documents").select("*", { count: "exact", head: true }).eq("boutique_id", boutiqueActive.id).eq("type", nouveauType);
    const numero = `${PREFIX[nouveauType]}-${String((count || 0) + 1).padStart(4, "0")}`;
    const statutInit = nouveauType === "facture" ? "impayee" : nouveauType === "bon_livraison" ? "a_livrer" : "en_attente";
    await supabase.from("documents").insert({
      boutique_id: boutiqueActive.id, type: nouveauType, numero,
      client: doc.client, client_phone: doc.client_phone,
      lignes: doc.lignes, remise: doc.remise, taux_tva: doc.taux_tva,
      total_ht: doc.total_ht, total_ttc: doc.total_ttc,
      statut: statutInit, date: today(), notes: doc.notes,
    });
    // On marque la source comme traitée
    if (doc.type === "devis") await supabase.from("documents").update({ statut: "accepte" }).eq("id", doc.id);
    onStatut(`✅ ${LIBELLE_DOC[doc.type]} → ${LIBELLE_DOC[nouveauType].toLowerCase()} ${numero}.`);
    setType(nouveauType);
    charger();
  };

  const supprimer = async (doc) => {
    if (!confirm(`Supprimer ${doc.numero} ?`)) return;
    await supabase.from("documents").delete().eq("id", doc.id);
    charger();
  };

  const badgeStatut = (s) => {
    const map = {
      en_attente: { c: C.yellow, t: "En attente" }, accepte: { c: C.green, t: "Accepté" }, refuse: { c: C.red, t: "Refusé" },
      impayee: { c: C.red, t: "Impayée" }, payee: { c: C.green, t: "Payée" },
      a_livrer: { c: C.yellow, t: "À livrer" }, livre: { c: C.green, t: "Livré" },
    }[s] || { c: C.muted, t: s };
    return <span style={{ background: map.c + "22", color: map.c, border: `1px solid ${map.c}55`, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>{map.t}</span>;
  };

  const docsFiltres = docs.filter(d => d.type === type);

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {/* SÉLECTEUR TYPE */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
        {TYPES.map(ty => (
          <button key={ty.id} onClick={() => { setType(ty.id); setCreation(false); }}
            style={{ padding: "9px 4px", borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer",
              border: `1px solid ${type === ty.id ? C.green : C.border}`, background: type === ty.id ? C.green + "22" : "transparent", color: type === ty.id ? C.green : C.muted }}>
            {ty.label}
          </button>
        ))}
      </div>

      {!creation ? (
        <button onClick={() => setCreation(true)}
          style={{ width: "100%", padding: 12, background: C.green, color: C.bg, border: "none", borderRadius: 10, fontWeight: "bold", fontSize: 14, cursor: "pointer", marginBottom: 12 }}>
          ➕ Nouveau {LIBELLE_DOC[type].toLowerCase()}
        </button>
      ) : (
        <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
          <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>NOUVEAU {LIBELLE_DOC[type]}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <input list="doc-clients" value={client}
              onChange={e => { const v = e.target.value; setClient(v); const k = clientsConnus.find(c => c.nom.toLowerCase() === v.toLowerCase()); if (k && k.phone) setClientPhone(k.phone); }}
              placeholder="Client (choisir ou taper)" style={inp} />
            <datalist id="doc-clients">
              {clientsConnus.map(c => <option key={c.nom} value={c.nom}>{c.phone ? `📱 ${c.phone}` : ""}</option>)}
            </datalist>
            <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Téléphone" type="tel" style={inp} />
          </div>

          {/* Constructeur de ligne */}
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <select value={produitId} onChange={e => { const v = e.target.value; setProduitId(v); const p = produits.find(x => String(x.id) === v); if (p) setPu(String(p.prix_vente || "")); }} style={{ ...inp, flex: 1 }}>
              <option value="">— Produit / libre —</option>
              {produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>
          {!produitId && <input value={libreNom} onChange={e => setLibreNom(e.target.value)} placeholder="Désignation libre" style={{ ...inp, marginBottom: 6 }} />}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, marginBottom: 10 }}>
            <input type="number" value={qte} onChange={e => setQte(e.target.value)} placeholder="Qté" style={inp} />
            <input type="number" value={pu} onChange={e => setPu(e.target.value)} placeholder="Prix unit." style={inp} />
            <button onClick={ajouterLigne} style={{ padding: "0 14px", background: C.green + "22", color: C.green, border: `1px solid ${C.green}55`, borderRadius: 8, fontWeight: "bold", cursor: "pointer" }}>+</button>
          </div>

          {/* Lignes */}
          {lignes.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
              <span style={{ color: C.text }}>{l.qte}x {l.nom}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: C.muted }}>{fmt(l.qte * l.pu)}</span>
                <button onClick={() => setLignes(prev => prev.filter((_, j) => j !== i))} style={{ background: C.red + "22", color: C.red, border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer", fontSize: 10 }}>✕</button>
              </span>
            </div>
          ))}

          {/* Remise + totaux */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ color: C.muted, fontSize: 12 }}>Remise (F)</span>
            <input type="number" value={remise} onChange={e => setRemise(e.target.value)} placeholder="0" style={{ ...inp, width: 90, textAlign: "right" }} />
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: C.muted, marginTop: 6 }}>
            HT : {fmt(ht)}{tauxTva > 0 ? ` · TVA ${tauxTva}% : ${fmt(tvaF)}` : ""}
          </div>
          <div style={{ textAlign: "right", fontSize: 16, fontWeight: "bold", color: C.green, marginTop: 2 }}>TOTAL : {fmt(ttc)}</div>

          {type === "devis" && (
            <input type="date" value={validite} onChange={e => setValidite(e.target.value)} title="Valable jusqu'au" style={{ ...inp, marginTop: 10 }} />
          )}
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optionnel)" rows={2} style={{ ...inp, marginTop: 8, resize: "vertical" }} />

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={enregistrer} disabled={enCours} style={{ flex: 1, padding: 11, background: enCours ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer" }}>
              {enCours ? "..." : "💾 Créer + imprimer"}
            </button>
            <button onClick={() => { reset(); setCreation(false); }} style={{ padding: "11px 16px", background: C.surface2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}

      {/* LISTE */}
      <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>{LIBELLE_DOC[type]}S ({docsFiltres.length})</div>
        {docsFiltres.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun document. Crée le premier ci-dessus.</div>}
        {docsFiltres.map(d => (
          <div key={d.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div>
                <div style={{ color: C.text, fontSize: 13, fontWeight: "bold" }}>{d.numero} · {d.client}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>{d.date} · {fmt(d.total_ttc)}</div>
              </div>
              {badgeStatut(d.statut)}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => imprimerDocument(d, boutique)} style={act(C.blue)}>📄 PDF</button>
              <button onClick={() => envoyerDocumentWhatsApp(d, boutique)} style={act("#25D366")}>💬 WhatsApp</button>
              <button onClick={() => envoyerDocumentSMS(d, boutique)} style={act(C.yellow)}>📩 SMS</button>
              {/* TRANSFORMATIONS */}
              {d.type === "devis" && (
                <>
                  <button onClick={() => convertir(d, "facture")} style={act(C.green)}>→ {t("facture")}</button>
                  <button onClick={() => convertir(d, "bon_livraison")} style={act(C.purple)}>→ {t("bon_livr")}</button>
                  {d.statut === "en_attente" && <button onClick={() => changerStatut(d, "refuse")} style={act(C.red)}>Refuser</button>}
                </>
              )}
              {d.type === "bon_livraison" && (
                <>
                  <button onClick={() => convertir(d, "facture")} style={act(C.green)}>→ {t("facture")}</button>
                  {d.statut === "a_livrer" && <button onClick={() => changerStatut(d, "livre")} style={act(C.green)}>✓ {t("livre_statut")}</button>}
                </>
              )}
              {d.type === "facture" && (
                <>
                  <button onClick={() => convertir(d, "bon_livraison")} style={act(C.purple)}>→ {t("bon_livr")}</button>
                  {d.statut === "impayee" && <button onClick={() => changerStatut(d, "payee")} style={act(C.green)}>✓ {t("payee")}</button>}
                </>
              )}
              <button onClick={() => supprimer(d)} style={act(C.red)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inp = { width: "100%", padding: "9px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, boxSizing: "border-box", outline: "none" };
const act = (c) => ({ background: c + "22", color: c, border: `1px solid ${c}44`, padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: "bold", cursor: "pointer" });
