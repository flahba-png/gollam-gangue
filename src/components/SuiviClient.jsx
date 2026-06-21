import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { C, fmt } from "../theme";
import { supabase } from "../supabase";

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

export default function SuiviClient({ credits, historique, boutiqueId, boutique, monNom, onImprimer, onNouvelleVente, onStatut }) {
  const [recherche, setRecherche] = useState("");
  const [clientSel, setClientSel] = useState(null);
  const [notes, setNotes] = useState([]);
  const [texte, setTexte] = useState("");
  const finRef = useRef(null);

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
    return [...map.values()].sort((a, b) => b.dernierTs - a.dernierTs);
  }, [credits, historique]);

  const filtres = clients.filter(c => !recherche || norm(c.nom).includes(norm(recherche)));

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
    if (error) { onStatut && onStatut("❌ " + error.message); setTexte(tx); return; }
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
        <div style={{ marginBottom: 12 }}>
          <input type="text" placeholder="🔍 Rechercher un client..." value={recherche} onChange={e => setRecherche(e.target.value)}
            style={{ width: "100%", padding: "11px 14px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, boxSizing: "border-box" }} />
        </div>
        <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          {filtres.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", padding: 16, textAlign: "center" }}>Aucun client. Ils apparaissent dès une vente nominative ou un crédit.</div>}
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
      </div>

      {/* Alerte financière épinglée */}
      {clientSel.dette > 0 && (
        <div style={{ background: C.red + "18", borderBottom: `1px solid ${C.red}44`, padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: C.red, fontSize: 11, fontWeight: "bold", letterSpacing: 0.5 }}>⚠️ RESTE À PAYER</span>
          <span style={{ color: C.red, fontSize: 16, fontWeight: "bold" }}>{fmt(clientSel.dette)}</span>
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
            🛒 Vente / Crédit
          </button>
          <button onClick={etatDeCompte}
            style={{ flex: 1, padding: "8px 0", background: C.blue + "18", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
            📄 État de compte
          </button>
        </div>
        <form onSubmit={envoyer} style={{ display: "flex", gap: 8 }}>
          <input value={texte} onChange={e => setTexte(e.target.value)} placeholder="Écrire une note sur ce client..."
            style={{ flex: 1, padding: "10px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 20, color: C.text, fontSize: 13, outline: "none" }} />
          <button type="submit" style={{ width: 42, height: 42, background: C.green, color: C.bg, border: "none", borderRadius: "50%", fontSize: 16, cursor: "pointer" }}>➤</button>
        </form>
      </div>
    </div>
  );
}
