import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { C, fmt, appeler, heure, todayISO } from "../theme";
import { supabase } from "../supabase";
import { relancerWhatsApp } from "../relance";
import { msgErreur } from "../erreurs";
import { estIndisponible, estLocal, lireLocal, ecrireLocal, supprimerLocal } from "../fallback";

// Suivi Client : ergonomie type messagerie (liste de discussions + fil par client).
// Le fil mélange : transactions/reçus (historique), alerte "reste à payer" (crédits)
// et notes texte internes (table notes_client).
const norm = (s) => String(s || "").trim().toLowerCase();

const jourLabel = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const j = new Date(d); j.setHours(0, 0, 0, 0);
  const diff = Math.round((auj - j) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff > 1 && diff < 7) return d.toLocaleDateString("fr-FR", { weekday: "long" });
  return d.toLocaleDateString("fr-FR");
};
const heureDe = (iso) => { try { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

export default function SuiviClient({ credits, historique, boutiqueId, boutique, boutiqueActive, estPatron = false, monNom, onImprimer, onNouvelleVente, onDevis, onStatut, onRefresh }) {
  const [recherche, setRecherche] = useState("");
  const [clientSel, setClientSel] = useState(null);
  const [notes, setNotes] = useState([]);
  const [texte, setTexte] = useState("");
  const [paiementOuvert, setPaiementOuvert] = useState(false);
  const [montantPaiement, setMontantPaiement] = useState("");
  const [plafonds, setPlafonds] = useState({}); // client(lower) -> plafond
  const [editPlaf, setEditPlaf] = useState("");
  const [clientsManuels, setClientsManuels] = useState([]);
  const [archives, setArchives] = useState([]); // noms (lower) masqués de la liste
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [nvNom, setNvNom] = useState("");
  const [nvPhone, setNvPhone] = useState("");
  const finRef = useRef(null);

  const chargerClients = useCallback(async () => {
    if (!boutiqueId) { setClientsManuels([]); return; }
    const cle = `clients_${boutiqueId}`;
    const { data, error } = await supabase.from("clients").select("*").eq("boutique_id", boutiqueId);
    if (error) {
      // Table absente ou réseau coupé : on retombe sur les clients gardés en local.
      if (estIndisponible(error)) { setClientsManuels(lireLocal(cle)); return; }
      setClientsManuels([]); return;
    }
    // Fusionne les clients restés en local (pas encore synchronisés) avec ceux de la base.
    const enBase = data || [];
    const locaux = lireLocal(cle).filter(l => !enBase.some(d => norm(d.nom) === norm(l.nom)));
    setClientsManuels([...enBase, ...locaux]);
  }, [boutiqueId]);

  const ajouterClient = async () => {
    const nom = nvNom.trim();
    if (!nom || !boutiqueId) { onStatut && onStatut("⚠️ Donne au moins un nom."); return; }
    if (clients.some(c => norm(c.nom) === norm(nom))) {
      onStatut && onStatut(`ℹ️ Le client « ${nom} » existe déjà.`);
      setNvNom(""); setNvPhone(""); setAjoutOuvert(false);
      return;
    }
    const phone = nvPhone.trim() || null;
    const { error } = await supabase.from("clients").insert({ boutique_id: boutiqueId, nom, phone });
    if (error && !estIndisponible(error)) { onStatut && onStatut(msgErreur(error)); return; }
    if (error) {
      // Indisponible (table pas encore créée ou hors-ligne) : on garde le client en local.
      // Il reste utilisable tout de suite et se synchronisera quand la base sera prête.
      const cle = `clients_${boutiqueId}`;
      const locaux = lireLocal(cle);
      if (!locaux.some(l => norm(l.nom) === norm(nom))) {
        locaux.push({ id: `local-${Date.now()}`, boutique_id: boutiqueId, nom, phone, _local: true });
        ecrireLocal(cle, locaux);
      }
    }
    setNvNom(""); setNvPhone(""); setAjoutOuvert(false);
    chargerClients();
    onStatut && onStatut(`✅ Client « ${nom} » ajouté.`);
  };

  // Supprimer (client manuel sans historique) ou masquer (client avec ventes/crédits).
  const supprimerClient = async (c) => {
    const aHistorique = (c.totalAchats || 0) > 0 || (c.dette || 0) > 0;
    if (aHistorique) {
      if (!confirm(`Masquer « ${c.nom} » de la liste ?\nSon historique de ventes et de crédits sera conservé.`)) return;
      const cle = `clients_archives_${boutiqueId}`;
      const arch = lireLocal(cle);
      if (!arch.includes(norm(c.nom))) { arch.push(norm(c.nom)); ecrireLocal(cle, arch); }
      setArchives(arch.slice());
      onStatut && onStatut(`👁️ « ${c.nom} » masqué de la liste.`);
    } else {
      if (!confirm(`Supprimer définitivement le client « ${c.nom} » ?`)) return;
      const enr = clientsManuels.find(m => norm(m.nom) === norm(c.nom));
      if (enr && !estLocal(enr.id)) {
        const { error } = await supabase.from("clients").delete().eq("id", enr.id);
        if (error && !estIndisponible(error)) { onStatut && onStatut(msgErreur(error)); return; }
      }
      // Retire aussi toute trace locale du même nom.
      const cle = `clients_${boutiqueId}`;
      if (enr) supprimerLocal(cle, enr.id);
      ecrireLocal(cle, lireLocal(cle).filter(x => norm(x.nom) !== norm(c.nom)));
      onStatut && onStatut(`🗑️ Client « ${c.nom} » supprimé.`);
    }
    setClientSel(null);
    chargerClients();
  };

  // Config fidélité (portée par la boutique). Le patron l'active/règle.
  const fid = {
    active: !!boutiqueActive?.fidelite_active,
    seuil: parseInt(boutiqueActive?.fidelite_seuil) || 1000,
    palier: parseInt(boutiqueActive?.fidelite_palier) || 10,
    valeur: parseInt(boutiqueActive?.fidelite_valeur) || 1000,
  };
  const [cfgFid, setCfgFid] = useState(fid);
  const [cfgOuvert, setCfgOuvert] = useState(false);
  const [rachats, setRachats] = useState({}); // client(lower) -> points déjà rachetés

  const chargerRachats = useCallback(async () => {
    if (!boutiqueId) { setRachats({}); return; }
    const { data } = await supabase.from("fidelite_rachats").select("client, points").eq("boutique_id", boutiqueId);
    const map = {}; (data || []).forEach(r => { const k = (r.client || "").toLowerCase(); map[k] = (map[k] || 0) + (r.points || 0); });
    setRachats(map);
  }, [boutiqueId]);
  useEffect(() => { chargerRachats(); }, [chargerRachats]);

  // Points effectifs = gagnés (total/seuil) − déjà rachetés
  const pointsDe = (totalAchats, nom) => {
    if (fid.seuil <= 0) return 0;
    const gagnes = Math.floor((totalAchats || 0) / fid.seuil);
    return Math.max(0, gagnes - (rachats[(nom || "").toLowerCase()] || 0));
  };

  // Utiliser une récompense : consomme `palier` points et le note dans le fil
  const utiliserRecompense = async (c) => {
    if (!boutiqueId) return;
    await supabase.from("fidelite_rachats").insert({ boutique_id: boutiqueId, client: c.nom, points: fid.palier, valeur: fid.valeur, auteur: monNom });
    await supabase.from("notes_client").insert({ boutique_id: boutiqueId, client: c.nom, auteur: monNom, texte: `🎁 Récompense fidélité utilisée : -${fid.palier} pts (valeur ${fmt(fid.valeur)})` });
    onStatut && onStatut(`🎁 Récompense de ${fmt(fid.valeur)} appliquée pour ${c.nom}.`);
    chargerRachats();
    chargerNotes();
  };

  const enregistrerFidelite = async () => {
    if (!boutiqueId) return;
    await supabase.from("boutiques").update({
      fidelite_active: cfgFid.active, fidelite_seuil: parseInt(cfgFid.seuil) || 1000,
      fidelite_palier: parseInt(cfgFid.palier) || 10, fidelite_valeur: parseInt(cfgFid.valeur) || 1000,
    }).eq("id", boutiqueId);
    setCfgOuvert(false);
    onRefresh && onRefresh();
  };

  // Plafonds de crédit
  const chargerPlafonds = useCallback(async () => {
    if (!boutiqueId) { setPlafonds({}); return; }
    const { data } = await supabase.from("plafonds").select("*").eq("boutique_id", boutiqueId);
    const map = {}; (data || []).forEach(p => { map[p.client.toLowerCase()] = p.plafond; });
    setPlafonds(map);
  }, [boutiqueId]);
  useEffect(() => { chargerPlafonds(); }, [chargerPlafonds]);
  useEffect(() => { chargerClients(); }, [chargerClients]);
  useEffect(() => { setArchives(boutiqueId ? lireLocal(`clients_archives_${boutiqueId}`) : []); }, [boutiqueId]);

  const definirPlafond = async (nomClient) => {
    if (!boutiqueId) return;
    await supabase.from("plafonds").upsert({ boutique_id: boutiqueId, client: nomClient, plafond: parseInt(editPlaf) || 0 }, { onConflict: "boutique_id,client" });
    setEditPlaf("");
    chargerPlafonds();
  };

  // Agrège les clients depuis crédits + historique (ventes nominatives)
  const clients = useMemo(() => {
    const map = new Map();
    const getC = (nom) => {
      const k = norm(nom);
      if (!map.has(k)) map.set(k, { nom: nom.trim(), phone: "", dette: 0, totalAchats: 0, dernierTs: 0, apercu: "" });
      return map.get(k);
    };
    credits.forEach(cr => {
      if (!cr.client) return;
      const c = getC(cr.client);
      c.dette += cr.reste_a_payer || 0;
      if (cr.client_phone && !c.phone) c.phone = cr.client_phone;
      const ts = new Date(cr.created_at || cr.date || 0).getTime();
      if (ts > c.dernierTs) { c.dernierTs = ts; c.apercu = `📒 Crédit : ${cr.article || ""}`; }
    });
    historique.forEach(h => {
      const nom = h.details_facture?.client;
      if (!nom || nom === "Client Comptoir") return;
      const c = getC(nom);
      c.totalAchats += h.montant || 0;
      if (h.details_facture?.clientPhone && !c.phone) c.phone = h.details_facture.clientPhone;
      const ts = new Date(h.created_at || `${h.date_iso}T${h.heure || "00:00"}`).getTime();
      if (ts > c.dernierTs) { c.dernierTs = ts; c.apercu = h.texte || ""; }
    });
    // Clients ajoutés manuellement (apparaissent même sans achat)
    clientsManuels.forEach(cl => {
      if (!cl.nom) return;
      const c = getC(cl.nom);
      if (cl.phone && !c.phone) c.phone = cl.phone;
      if (!c.apercu) c.apercu = "Nouveau client";
    });
    return [...map.values()].sort((a, b) => b.dernierTs - a.dernierTs);
  }, [credits, historique, clientsManuels]);

  const filtres = clients.filter(c => !archives.includes(norm(c.nom)) && (!recherche || norm(c.nom).includes(norm(recherche))));

  // Notes du client sélectionné
  const chargerNotes = useCallback(async () => {
    if (!clientSel || !boutiqueId) { setNotes([]); return; }
    const { data } = await supabase.from("notes_client").select("*")
      .eq("boutique_id", boutiqueId).ilike("client", clientSel.nom).order("created_at");
    setNotes(data || []);
  }, [clientSel, boutiqueId]);
  useEffect(() => { chargerNotes(); }, [chargerNotes]);

  // Construit le fil chronologique (transactions + notes)
  const fil = useMemo(() => {
    if (!clientSel) return [];
    const items = [];
    historique.forEach(h => {
      if (norm(h.details_facture?.client) !== norm(clientSel.nom)) return;
      const ts = new Date(h.created_at || `${h.date_iso}T${h.heure || "00:00"}`).getTime();
      const estVersement = ["Remboursement Partiel", "Solde de Compte"].includes(h.details_facture?.type) || (h.texte || "").includes("Versement");
      items.push({ ts, kind: estVersement ? "paiement" : (h.type === "retour" ? "retour" : "achat"), h });
    });
    notes.forEach(n => items.push({ ts: new Date(n.created_at).getTime(), kind: "note", n }));
    return items.sort((a, b) => a.ts - b.ts);
  }, [clientSel, historique, notes]);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [fil]);

  const envoyer = async (e) => {
    e.preventDefault();
    const tx = texte.trim();
    if (!tx || !clientSel || !boutiqueId) return;
    setTexte("");
    const { error } = await supabase.from("notes_client").insert({ boutique_id: boutiqueId, client: clientSel.nom, auteur: monNom, texte: tx });
    if (error) { onStatut && onStatut(msgErreur(error)); setTexte(tx); return; }
    chargerNotes();
  };

  // Encaisse un paiement : l'applique aux crédits du client (plus anciens d'abord)
  const encaisser = async () => {
    const montant = parseInt(montantPaiement) || 0;
    if (montant <= 0 || !clientSel || !boutiqueId) { onStatut && onStatut("⚠️ Entre un montant valide."); return; }
    if ((clientSel.dette || 0) <= 0) { onStatut && onStatut("ℹ️ Ce client n'a pas de dette à encaisser."); return; }
    if (montant > (clientSel.dette || 0)) { onStatut && onStatut(`⚠️ Dépasse la dette (${fmt(clientSel.dette)}).`); return; }

    const fiches = credits
      .filter(c => norm(c.client) === norm(clientSel.nom) && (c.reste_a_payer || 0) > 0)
      .sort((a, b) => new Date(a.created_at || a.date || 0) - new Date(b.created_at || b.date || 0));

    let reste = montant;
    for (const f of fiches) {
      if (reste <= 0) break;
      const aPayer = Math.min(reste, f.reste_a_payer);
      const nouveau = f.reste_a_payer - aPayer;
      await supabase.from("historique").insert({
        boutique_id: boutiqueId, heure: heure(), date_iso: todayISO(),
        texte: `💰 Versement de ${f.client} (${f.article})`, type: "vente", montant: aPayer, benefice_etabli: 0,
        details_facture: { client: f.client, article: `Acompte : ${f.article}`, total: aPayer, reste: nouveau, type: nouveau === 0 ? "Solde de Compte" : "Remboursement Partiel" },
      });
      if (nouveau === 0) await supabase.from("credits").delete().eq("id", f.id);
      else await supabase.from("credits").update({ avance: (f.avance || 0) + aPayer, reste_a_payer: nouveau }).eq("id", f.id);
      reste -= aPayer;
    }
    await supabase.from("notes_client").insert({ boutique_id: boutiqueId, client: clientSel.nom, auteur: monNom, texte: `💰 Paiement reçu : ${fmt(montant)}` });
    setMontantPaiement(""); setPaiementOuvert(false);
    onStatut && onStatut(`✅ Paiement de ${fmt(montant)} encaissé.`);
    onRefresh && onRefresh();
    chargerNotes();
  };

  // PDF état de compte du client (achats, versements, solde)
  const etatDeCompte = () => {
    const lignes = fil.filter(i => i.kind !== "note").map(i => {
      const h = i.h;
      const signe = i.kind === "paiement" ? "+ payé" : i.kind === "retour" ? "retour" : "achat";
      return `<tr><td>${h.date_iso || ""}</td><td>${h.texte || ""}</td><td style="text-align:right">${signe}</td><td style="text-align:right">${fmt(h.montant || 0)}</td></tr>`;
    }).join("");
    const w = window.open("", "_blank", "width=720,height=900");
    w.document.write(`<html><head><title>État de compte ${clientSel.nom}</title><style>
      body{font-family:Arial,sans-serif;padding:30px;color:#222;max-width:700px;margin:auto}
      h1{font-size:20px;margin:0} .sub{color:#666;font-size:13px;margin-bottom:18px}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
      th,td{padding:7px 8px;border-bottom:1px solid #eee;text-align:left}
      th{background:#f5f5f5;font-size:11px;text-transform:uppercase}
      .solde{margin-top:18px;font-size:18px;font-weight:bold;text-align:right;color:${clientSel.dette > 0 ? "#c00" : "#0a0"}}
    </style></head><body>
      <h1>${boutique?.nom || "Boutique"}</h1>
      <div class="sub">État de compte — ${clientSel.nom}${clientSel.phone ? " · " + clientSel.phone : ""} · ${new Date().toLocaleDateString("fr-FR")}</div>
      <table><tr><th>Date</th><th>Opération</th><th style="text-align:right">Type</th><th style="text-align:right">Montant</th></tr>${lignes || '<tr><td colspan="4">Aucune opération.</td></tr>'}</table>
      <div class="solde">RESTE À PAYER : ${fmt(clientSel.dette)}</div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 400);
  };

  // ---------- VUE LISTE ----------
  if (!clientSel) {
    return (
      <div style={{ padding: "0 12px 12px" }}>
        {/* CONFIG FIDÉLITÉ (patron) */}
        {estPatron && boutiqueId && (
          <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${fid.active ? C.green + "55" : C.border}`, padding: 12, marginBottom: 10 }}>
            <div onClick={() => setCfgOuvert(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <span style={{ color: C.text, fontSize: 13, fontWeight: "bold" }}>🎁 Programme de fidélité</span>
              <span style={{ fontSize: 11, fontWeight: "bold", color: fid.active ? C.green : C.muted }}>{fid.active ? `Actif · 1 pt / ${fmt(fid.seuil)}` : "Désactivé"} {cfgOuvert ? "▲" : "▼"}</span>
            </div>
            {cfgOuvert && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.text }}>
                  <input type="checkbox" checked={cfgFid.active} onChange={e => setCfgFid(c => ({ ...c, active: e.target.checked }))} /> Activer la fidélité
                </label>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: C.muted }}><span>1 point tous les</span><input type="number" value={cfgFid.seuil} onChange={e => setCfgFid(c => ({ ...c, seuil: e.target.value }))} style={miniInp} /><span>F</span></div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: C.muted }}><span>Récompense dès</span><input type="number" value={cfgFid.palier} onChange={e => setCfgFid(c => ({ ...c, palier: e.target.value }))} style={miniInp} /><span>pts</span></div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: C.muted }}><span>Valeur récompense</span><input type="number" value={cfgFid.valeur} onChange={e => setCfgFid(c => ({ ...c, valeur: e.target.value }))} style={miniInp} /><span>F</span></div>
                <button onClick={enregistrerFidelite} style={{ padding: 9, background: C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>Enregistrer</button>
              </div>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input type="text" placeholder="🔍 Rechercher un client..." value={recherche} onChange={e => setRecherche(e.target.value)}
            style={{ flex: 1, padding: "11px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, boxSizing: "border-box" }} />
          <button onClick={() => setAjoutOuvert(o => !o)} title="Nouveau client"
            style={{ flexShrink: 0, padding: "0 14px", background: C.green, color: C.bg, border: "none", borderRadius: 10, fontSize: 18, fontWeight: "bold", cursor: "pointer" }}>＋</button>
        </div>

        {/* FORMULAIRE NOUVEAU CLIENT */}
        {ajoutOuvert && (
          <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.green}55`, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: C.text, fontWeight: "bold", marginBottom: 8 }}>➕ Nouveau client</div>
            <input value={nvNom} onChange={e => setNvNom(e.target.value)} placeholder="Nom du client"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", marginBottom: 8, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13 }} />
            <input type="tel" value={nvPhone} onChange={e => setNvPhone(e.target.value)} placeholder="📱 Téléphone (facultatif)"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", marginBottom: 8, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setAjoutOuvert(false); setNvNom(""); setNvPhone(""); }}
                style={{ padding: "9px 14px", background: C.surface2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Annuler</button>
              <button onClick={ajouterClient}
                style={{ flex: 1, padding: 9, background: C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>Enregistrer</button>
            </div>
          </div>
        )}

        <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          {filtres.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", padding: 16, textAlign: "center" }}>Aucun client. Ajoute-en un avec ＋, ou ils apparaissent dès une vente nominative / un crédit.</div>}
          {filtres.map((c, i) => (
            <div key={i} onClick={() => setClientSel(c)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderBottom: i < filtres.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.green + "22", color: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: "bold", flexShrink: 0 }}>
                {c.nom.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 14, fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nom}</div>
                <div style={{ color: C.muted, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.apercu || "—"}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ color: C.muted, fontSize: 10 }}>{c.dernierTs ? jourLabel(new Date(c.dernierTs).toISOString()) : ""}</div>
                {c.dette > 0 && (
                  <div style={{ marginTop: 4, background: C.red, color: "#fff", borderRadius: 12, padding: "1px 8px", fontSize: 10, fontWeight: "bold", display: "inline-block" }}>
                    {fmt(c.dette)}
                  </div>
                )}
                {fid.active && pointsDe(c.totalAchats, c.nom) > 0 && (
                  <div style={{ marginTop: 3, fontSize: 9, fontWeight: "bold", color: pointsDe(c.totalAchats, c.nom) >= fid.palier ? C.green : C.yellow }}>
                    {pointsDe(c.totalAchats, c.nom) >= fid.palier ? "🎁 récompense" : `⭐ ${pointsDe(c.totalAchats, c.nom)} pt`}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- VUE FIL ----------
  let dernierJour = "";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 150px)" }}>
      {/* En-tête du fil */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        <button onClick={() => setClientSel(null)} style={{ background: "transparent", border: "none", color: C.text, fontSize: 20, cursor: "pointer" }}>‹</button>
        <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.green + "22", color: C.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: "bold" }}>
          {clientSel.nom.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 14, fontWeight: "bold" }}>{clientSel.nom}</div>
          <div style={{ color: C.muted, fontSize: 11 }}>{clientSel.phone || "Pas de numéro"}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {clientSel.phone && (
            <button onClick={() => appeler(clientSel.phone)} title="Appeler" style={{ background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 8, padding: "6px 9px", fontSize: 14, cursor: "pointer" }}>📞</button>
          )}
          {clientSel.phone && clientSel.dette > 0 && (
            <button onClick={() => relancerWhatsApp({ nom: clientSel.nom, phone: clientSel.phone, reste: clientSel.dette }, boutique)} title="Relancer (WhatsApp)" style={{ background: "#25D36622", color: "#25D366", border: "1px solid #25D36644", borderRadius: 8, padding: "6px 9px", fontSize: 14, cursor: "pointer" }}>💬</button>
          )}
          <button onClick={() => supprimerClient(clientSel)}
            title={(clientSel.totalAchats || 0) > 0 || (clientSel.dette || 0) > 0 ? "Masquer de la liste (garde l'historique)" : "Supprimer le client"}
            style={{ background: C.red + "18", color: C.red, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "6px 9px", fontSize: 14, cursor: "pointer" }}>🗑️</button>
        </div>
      </div>

      {/* Alerte financière épinglée */}
      {clientSel.dette > 0 && (
        <div style={{ background: C.red + "18", borderBottom: `1px solid ${C.red}44`, padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: C.red, fontSize: 11, fontWeight: "bold", letterSpacing: 0.5 }}>⚠️ RESTE À PAYER</span>
          <span style={{ color: C.red, fontSize: 16, fontWeight: "bold" }}>{fmt(clientSel.dette)}</span>
        </div>
      )}

      {/* Infos client : fidélité + plafond */}
      {(fid.active || estPatron) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: C.surface, fontSize: 11 }}>
          {fid.active && (() => {
            const pts = pointsDe(clientSel.totalAchats, clientSel.nom);
            const reco = fid.palier > 0 && pts >= fid.palier;
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: reco ? C.green : C.yellow, fontWeight: "bold" }}>🎁 {pts} pt{reco ? ` · ${fmt(fid.valeur)} dispo` : ` (à ${fid.palier})`}</span>
                {reco && (
                  <button onClick={() => utiliserRecompense(clientSel)}
                    style={{ background: C.green, color: C.bg, border: "none", borderRadius: 8, padding: "3px 9px", fontSize: 10, fontWeight: "bold", cursor: "pointer" }}>
                    Utiliser
                  </button>
                )}
              </span>
            );
          })()}
          {estPatron && (() => {
            const plaf = plafonds[clientSel.nom.toLowerCase()] || 0;
            const depasse = plaf > 0 && clientSel.dette > plaf;
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                <span style={{ color: plaf > 0 ? (depasse ? C.red : C.muted) : C.muted }}>Plafond : {plaf > 0 ? fmt(plaf) : "—"}</span>
                <input type="number" placeholder="définir" value={editPlaf} onChange={e => setEditPlaf(e.target.value)} style={{ width: 70, padding: "3px 6px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 11 }} />
                <button onClick={() => definirPlafond(clientSel.nom)} style={{ background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: "bold", cursor: "pointer" }}>OK</button>
              </span>
            );
          })()}
        </div>
      )}

      {/* Fil de bulles */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px", background: C.bg }}>
        {fil.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", textAlign: "center", padding: 20 }}>Aucune opération. Écris une note ou enregistre une vente ci-dessous.</div>}
        {fil.map((it, idx) => {
          const jour = jourLabel(new Date(it.ts).toISOString());
          const sep = jour !== dernierJour ? (dernierJour = jour, jour) : null;
          return (
            <React.Fragment key={idx}>
              {sep && (
                <div style={{ textAlign: "center", margin: "10px 0" }}>
                  <span style={{ background: C.surface2, color: C.muted, fontSize: 10, padding: "3px 10px", borderRadius: 10 }}>{sep}</span>
                </div>
              )}
              {it.kind === "note" ? (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                  <div style={{ maxWidth: "80%", background: C.green + "22", border: `1px solid ${C.green}44`, borderRadius: 12, padding: "8px 11px" }}>
                    <div style={{ color: C.text, fontSize: 13, wordBreak: "break-word" }}>{it.n.texte}</div>
                    <div style={{ color: C.muted, fontSize: 9, textAlign: "right", marginTop: 2 }}>{it.n.auteur || ""} · {heureDe(it.n.created_at)}</div>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                  <div style={{ maxWidth: "85%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{it.kind === "paiement" ? "💰" : it.kind === "retour" ? "↩️" : "🧾"}</span>
                      <span style={{ fontSize: 10, fontWeight: "bold", color: it.kind === "paiement" ? C.green : it.kind === "retour" ? C.red : C.blue }}>
                        {it.kind === "paiement" ? "VERSEMENT" : it.kind === "retour" ? "RETOUR" : "ACHAT / REÇU"}
                      </span>
                    </div>
                    <div style={{ color: C.text, fontSize: 13 }}>{it.h.texte}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                      <span style={{ color: it.kind === "retour" ? C.red : C.green, fontWeight: "bold", fontSize: 13 }}>{fmt(it.h.montant || 0)}</span>
                      {it.kind === "achat" && onImprimer && (
                        <button onClick={() => onImprimer(it.h)} style={{ background: C.blue + "18", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", fontWeight: "bold" }}>📄 Reçu</button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
        <div ref={finRef} />
      </div>

      {/* Raccourcis + saisie */}
      <div style={{ borderTop: `1px solid ${C.border}`, background: C.surface, padding: "8px 10px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button onClick={() => onNouvelleVente && onNouvelleVente(clientSel.nom)}
            style={{ flex: 1, padding: "8px 0", background: C.green + "18", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
            🛒 Vente
          </button>
          <button onClick={() => { setPaiementOuvert(o => !o); setMontantPaiement(""); }}
            style={{ flex: 1, padding: "8px 0", background: (clientSel.dette > 0 ? C.yellow : C.muted) + "18", color: clientSel.dette > 0 ? C.yellow : C.muted, border: `1px solid ${(clientSel.dette > 0 ? C.yellow : C.border)}44`, borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
            💰 Paiement
          </button>
          <button onClick={() => onDevis && onDevis(clientSel.nom, clientSel.phone)}
            style={{ flex: 1, padding: "8px 0", background: C.blue + "18", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
            📝 Devis
          </button>
          <button onClick={etatDeCompte}
            style={{ flex: 1, padding: "8px 0", background: C.surface2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
            📄 État
          </button>
        </div>

        {/* ENCAISSEMENT D'UN PAIEMENT */}
        {paiementOuvert && (
          <div style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.yellow}55`, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted, marginBottom: 6 }}>
              <span>💰 Paiement reçu de {clientSel.nom}</span>
              <span style={{ color: clientSel.dette > 0 ? C.red : C.green, fontWeight: "bold" }}>Dette : {fmt(clientSel.dette || 0)}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" inputMode="numeric" value={montantPaiement} onChange={e => setMontantPaiement(e.target.value)}
                placeholder="Montant reçu" autoFocus
                style={{ flex: 1, padding: "9px 12px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13 }} />
              <button onClick={encaisser}
                style={{ padding: "9px 16px", background: C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>Encaisser</button>
            </div>
          </div>
        )}
        <form onSubmit={envoyer} style={{ display: "flex", gap: 8 }}>
          <input value={texte} onChange={e => setTexte(e.target.value)} placeholder="Écrire une note sur ce client..."
            style={{ flex: 1, padding: "10px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 20, color: C.text, fontSize: 13, outline: "none" }} />
          <button type="submit" style={{ width: 42, height: 42, background: C.green, color: C.bg, border: "none", borderRadius: "50%", fontSize: 16, cursor: "pointer" }}>➤</button>
        </form>
      </div>
    </div>
  );
}

const miniInp = { width: 80, padding: "6px 8px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 12, textAlign: "right" };
