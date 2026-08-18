import React, { useState, useEffect, useCallback, useMemo } from "react";
import { C, fmt, today, todayISO, envoyerWhatsApp, appeler } from "../theme";
import { supabase } from "../supabase";
import { msgErreur } from "../erreurs";
import { estIndisponible } from "../fallback";

// Ce que la boutique DOIT à ses fournisseurs (miroir des crédits clients).
// Sert à connaître sa trésorerie réelle : encaissements attendus − dettes à payer.
export default function DettesFournisseurs({ boutiqueId, boutique, fournisseurs = [], monNom, onStatut }) {
  const [dettes, setDettes] = useState([]);
  const [creation, setCreation] = useState(false);
  const [fournisseurId, setFournisseurId] = useState("");
  const [nomLibre, setNomLibre] = useState("");
  const [description, setDescription] = useState("");
  const [montant, setMontant] = useState("");
  const [avance, setAvance] = useState("");
  const [echeance, setEcheance] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [paiements, setPaiements] = useState({}); // id -> montant saisi

  const charger = useCallback(async () => {
    if (!boutiqueId) { setDettes([]); return; }
    const { data, error } = await supabase.from("dettes_fournisseurs").select("*")
      .eq("boutique_id", boutiqueId).gt("reste_a_payer", 0).order("echeance", { nullsFirst: false });
    if (error) { setDettes([]); return; }
    setDettes(data || []);
  }, [boutiqueId]);
  useEffect(() => { charger(); }, [charger]);

  const totalDu = useMemo(() => dettes.reduce((s, d) => s + (d.reste_a_payer || 0), 0), [dettes]);
  const enRetard = useMemo(() => dettes.filter(d => d.echeance && d.echeance < todayISO()), [dettes]);

  const enregistrer = async () => {
    const f = fournisseurs.find(x => String(x.id) === fournisseurId);
    const nomF = f?.nom || nomLibre.trim();
    const tot = parseInt(montant) || 0;
    const av = Math.min(parseInt(avance) || 0, tot);
    if (!nomF) { onStatut("⚠️ Indique le fournisseur."); return; }
    if (tot <= 0) { onStatut("⚠️ Montant invalide."); return; }
    setEnCours(true);
    const { error } = await supabase.from("dettes_fournisseurs").insert({
      boutique_id: boutiqueId, fournisseur_id: f?.id || null, fournisseur_nom: nomF,
      description: description.trim() || null, total: tot, paye: av, reste_a_payer: tot - av,
      echeance: echeance || null, date: today(), cree_par: monNom,
    });
    setEnCours(false);
    if (error) {
      onStatut(estIndisponible(error)
        ? "⚠️ Mise à jour de la base requise (migration 39) pour enregistrer les dettes fournisseurs."
        : msgErreur(error));
      return;
    }
    setCreation(false); setFournisseurId(""); setNomLibre(""); setDescription(""); setMontant(""); setAvance(""); setEcheance("");
    onStatut(`✅ Dette enregistrée : ${fmt(tot - av)} dû à ${nomF}.`);
    charger();
  };

  const payer = async (d) => {
    const m = parseInt(paiements[d.id]) || 0;
    if (m <= 0) { onStatut("⚠️ Entre un montant."); return; }
    if (m > d.reste_a_payer) { onStatut(`⚠️ Dépasse la dette (${fmt(d.reste_a_payer)}).`); return; }
    const reste = d.reste_a_payer - m;
    const { error } = await supabase.from("dettes_fournisseurs")
      .update({ paye: (d.paye || 0) + m, reste_a_payer: reste }).eq("id", d.id);
    if (error) { onStatut(msgErreur(error)); return; }
    setPaiements(p => ({ ...p, [d.id]: "" }));
    onStatut(reste === 0 ? `✅ Dette envers ${d.fournisseur_nom} soldée.` : `✅ ${fmt(m)} payé à ${d.fournisseur_nom}, reste ${fmt(reste)}.`);
    charger();
  };

  const supprimer = async (d) => {
    if (!confirm(`Supprimer la dette envers ${d.fournisseur_nom} ?`)) return;
    await supabase.from("dettes_fournisseurs").delete().eq("id", d.id);
    charger();
  };

  const telDe = (d) => fournisseurs.find(f => f.id === d.fournisseur_id)?.telephone || "";

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {/* TOTAL DÛ */}
      <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${totalDu > 0 ? C.red + "55" : C.border}`, padding: 14, marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: "bold", letterSpacing: 0.5 }}>💸 CE QUE JE DOIS À MES FOURNISSEURS</div>
        <div style={{ fontSize: 24, fontWeight: "bold", color: totalDu > 0 ? C.red : C.green, marginTop: 4 }}>{fmt(totalDu)}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{dettes.length} dette(s) en cours{enRetard.length > 0 ? ` · ${enRetard.length} en retard` : ""}</div>
      </div>

      {enRetard.length > 0 && (
        <div style={{ background: C.red + "18", borderRadius: 8, border: `1px solid ${C.red}44`, padding: 10, marginBottom: 10 }}>
          <div style={{ color: C.red, fontSize: 12, fontWeight: "bold" }}>⚠️ {enRetard.length} échéance(s) dépassée(s) : {fmt(enRetard.reduce((s, d) => s + d.reste_a_payer, 0))}</div>
        </div>
      )}

      {!creation ? (
        <button onClick={() => setCreation(true)}
          style={{ width: "100%", padding: 11, marginBottom: 12, background: C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
          + Enregistrer une dette fournisseur
        </button>
      ) : (
        <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.green}55`, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", color: C.text, fontSize: 13, marginBottom: 10 }}>💸 Nouvelle dette</div>
          <label style={lbl}>FOURNISSEUR</label>
          <select value={fournisseurId} onChange={e => setFournisseurId(e.target.value)} style={{ ...inp, width: "100%", marginBottom: 6 }}>
            <option value="">— Choisir (ou saisir ci-dessous) —</option>
            {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
          {!fournisseurId && (
            <input value={nomLibre} onChange={e => setNomLibre(e.target.value)} placeholder="Nom du fournisseur"
              style={{ ...inp, width: "100%", marginBottom: 6 }} />
          )}
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Objet (ex: 20 cartons de filtres)"
            style={{ ...inp, width: "100%", marginBottom: 6 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
            <div><label style={lbl}>MONTANT TOTAL</label><input type="number" inputMode="numeric" value={montant} onChange={e => setMontant(e.target.value)} placeholder="0" style={inp} /></div>
            <div><label style={lbl}>DÉJÀ PAYÉ</label><input type="number" inputMode="numeric" value={avance} onChange={e => setAvance(e.target.value)} placeholder="0" style={inp} /></div>
          </div>
          <label style={lbl}>À PAYER AVANT LE (facultatif)</label>
          <input type="date" value={echeance} onChange={e => setEcheance(e.target.value)} style={{ ...inp, width: "100%", marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setCreation(false)} style={{ padding: "10px 14px", background: C.surface2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Annuler</button>
            <button onClick={enregistrer} disabled={enCours} style={{ flex: 1, padding: 10, background: enCours ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 14, cursor: "pointer" }}>{enCours ? "..." : "Enregistrer"}</button>
          </div>
        </div>
      )}

      {/* LISTE DES DETTES */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>💸 DETTES EN COURS ({dettes.length})</div>
        {dettes.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucune dette fournisseur. 👍</div>}
        {dettes.map(d => {
          const retard = d.echeance && d.echeance < todayISO();
          const tel = telDe(d);
          return (
            <div key={d.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: "bold" }}>{d.fournisseur_nom}</div>
                  <div style={{ color: C.muted, fontSize: 10 }}>{d.description || "—"}</div>
                  <div style={{ color: C.muted, fontSize: 10 }}>
                    Total {fmt(d.total)} · payé {fmt(d.paye)}
                    {d.echeance && <span style={{ color: retard ? C.red : C.muted, fontWeight: retard ? "bold" : "normal" }}> · échéance {d.echeance.split("-").reverse().join("/")}{retard ? " ⚠️" : ""}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                  <div style={{ color: C.red, fontWeight: "bold", fontSize: 14 }}>{fmt(d.reste_a_payer)}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 4, justifyContent: "flex-end" }}>
                    {tel && <button onClick={() => appeler(tel)} aria-label="Appeler" style={{ background: C.green + "18", color: C.green, border: `1px solid ${C.green}44`, borderRadius: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>📞</button>}
                    {tel && <button onClick={() => envoyerWhatsApp(tel, `Bonjour, concernant notre dette de ${fmt(d.reste_a_payer)} (${d.description || ""}) — ${boutique?.nom || ""}.`)} aria-label="WhatsApp" style={{ background: "#25D36618", color: "#25D366", border: "1px solid #25D36644", borderRadius: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>💬</button>}
                    <button onClick={() => supprimer(d)} aria-label="Supprimer" style={{ background: C.red + "18", color: C.red, border: `1px solid ${C.red}33`, borderRadius: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}>🗑️</button>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <input type="number" inputMode="numeric" value={paiements[d.id] || ""} onChange={e => setPaiements(p => ({ ...p, [d.id]: e.target.value }))}
                  placeholder="Montant payé..." style={{ ...inp, flex: 1 }} />
                <button onClick={() => payer(d)} style={{ padding: "9px 16px", background: C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>Payer</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inp = { padding: "9px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, boxSizing: "border-box" };
const lbl = { display: "block", fontSize: 9, color: "var(--muted)", fontWeight: "bold", letterSpacing: 0.5, marginBottom: 4 };
