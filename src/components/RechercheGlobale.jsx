import React, { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt } from "../theme";

// Recherche globale : produits, clients (crédits), mouvements/factures (historique).
// Un clic sur un résultat amène vers l'onglet concerné.
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function RechercheGlobale({ produits, credits, historique, onNaviguer, onClose }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const resultats = useMemo(() => {
    const s = norm(q.trim());
    if (s.length < 2) return null;

    const produitsR = produits.filter(p =>
      norm(p.nom).includes(s) || norm(p.reference_oem).includes(s) || norm(p.code_barre).includes(s) || norm(p.compatibilite).includes(s)
    ).slice(0, 8);

    // Clients uniques issus des crédits
    const vusClient = new Set();
    const clientsR = [];
    credits.forEach(c => {
      const cle = norm(c.client);
      if (norm(c.client).includes(s) && !vusClient.has(cle)) {
        vusClient.add(cle);
        const fiches = credits.filter(x => norm(x.client) === cle);
        clientsR.push({ client: c.client, phone: c.client_phone, reste: fiches.reduce((t, x) => t + (x.reste_a_payer || 0), 0), n: fiches.length });
      }
    });

    const mouvementsR = historique.filter(h =>
      norm(h.texte).includes(s) || norm(h.details_facture?.client).includes(s) || norm(h.details_facture?.article).includes(s)
    ).slice(0, 8);

    return { produitsR, clientsR: clientsR.slice(0, 8), mouvementsR };
  }, [q, produits, credits, historique]);

  const aller = (onglet) => { onNaviguer(onglet); onClose(); };

  const Section = ({ titre, vide, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: "bold", letterSpacing: 0.5, marginBottom: 6 }}>{titre}</div>
      {vide ? <div style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>Aucun résultat</div> : children}
    </div>
  );

  const ligne = (key, principal, secondaire, droite, onClick) => (
    <div key={key} onClick={onClick}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: C.surface2, border: `1px solid ${C.border}`, marginBottom: 6 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{principal}</div>
        {secondaire && <div style={{ color: C.muted, fontSize: 10 }}>{secondaire}</div>}
      </div>
      {droite && <span style={{ flexShrink: 0, marginLeft: 8, fontSize: 12, fontWeight: "bold" }}>{droite}</span>}
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, width: "100%", maxWidth: 480, marginTop: 24, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="🔍 Produit, client, facture..."
            style={{ flex: 1, padding: "11px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 14, outline: "none" }} />
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ overflowY: "auto" }}>
          {!resultats ? (
            <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "24px 0", fontStyle: "italic" }}>
              Tape au moins 2 lettres pour chercher.
            </div>
          ) : (
            <>
              <Section titre={`📦 PRODUITS (${resultats.produitsR.length})`} vide={resultats.produitsR.length === 0}>
                {resultats.produitsR.map(p => ligne(
                  "p" + p.id, p.nom,
                  p.reference_oem ? `réf. ${p.reference_oem}` : null,
                  <span style={{ color: (p.stock || 0) <= 2 ? C.red : C.green }}>{p.stock || 0} u · {fmt(p.prix_vente)}</span>,
                  () => aller("stock")
                ))}
              </Section>

              <Section titre={`👥 CLIENTS (${resultats.clientsR.length})`} vide={resultats.clientsR.length === 0}>
                {resultats.clientsR.map((c, i) => ligne(
                  "c" + i, c.client,
                  `${c.n} crédit(s)${c.phone ? " · " + c.phone : ""}`,
                  c.reste > 0 ? <span style={{ color: C.red }}>{fmt(c.reste)} dû</span> : <span style={{ color: C.green }}>à jour</span>,
                  () => aller("credits")
                ))}
              </Section>

              <Section titre={`🧾 MOUVEMENTS (${resultats.mouvementsR.length})`} vide={resultats.mouvementsR.length === 0}>
                {resultats.mouvementsR.map(h => ligne(
                  "h" + h.id, h.texte,
                  `${h.heure || ""} · ${h.date_iso || ""}`,
                  h.montant ? <span style={{ color: h.type === "depense" || h.type === "retour" ? C.red : C.green }}>{fmt(h.montant)}</span> : null,
                  () => aller("historique")
                ))}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
