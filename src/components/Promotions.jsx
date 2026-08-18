import React, { useState, useEffect, useCallback } from "react";
import { C, todayISO, envoyerWhatsApp } from "../theme";
import { partagerAffiche } from "../affiche";
import { supabase } from "../supabase";
import ProduitSelect from "./ProduitSelect";
import { msgErreur } from "../erreurs";
import { estIndisponible, estLocal, lireLocal, ajouterLocal, supprimerLocal, fusionnerLocal } from "../fallback";

// Campagnes de promotion : % de remise sur une sélection d'articles, sur une période.
// Le prix remisé s'applique automatiquement en vente (voir SaisieForm).
export const statutPromo = (p) => {
  const t = todayISO();
  if (p.date_debut && p.date_debut > t) return "programmee";
  if (p.date_fin && p.date_fin < t) return "expiree";
  return "active";
};

export default function Promotions({ produits, boutiqueId, monNom, onStatut, onRefresh, clientsConnus = [], boutique }) {
  const [promos, setPromos] = useState([]);
  const [creation, setCreation] = useState(false);
  const [debut, setDebut] = useState(todayISO());
  const [fin, setFin] = useState(todayISO());
  const [pct, setPct] = useState("10");
  const [notes, setNotes] = useState("");
  const [arts, setArts] = useState([]);   // noms d'articles ciblés
  const [enCours, setEnCours] = useState(false);
  const [annonceId, setAnnonceId] = useState(null);  // promo dont le panneau d'annonce est ouvert
  const [envoyes, setEnvoyes] = useState({});        // "promoId_nomClient" -> true

  // Message d'annonce prêt à envoyer (personnalisé par client)
  const texteAnnonce = (p, nomClient = "") => {
    const dates = p.date_debut && p.date_fin ? ` jusqu'au ${p.date_fin.split("-").reverse().slice(0, 2).join("/")}` : "";
    const articles = (p.produits || []).slice(0, 4).join(", ") + ((p.produits || []).length > 4 ? "…" : "");
    return `${nomClient ? `Bonjour ${nomClient} ! ` : ""}🎉 PROMO chez ${boutique?.nom || "nous"} : *-${p.pourcentage}%* sur ${articles}${dates}. Passe vite avant la fin ! 🏃`;
  };

  const envoyerA = (p, client) => {
    envoyerWhatsApp(client.phone, texteAnnonce(p, client.nom.split(" ")[0]));
    setEnvoyes(prev => ({ ...prev, [`${p.id}_${client.nom}`]: true }));
  };

  const charger = useCallback(async () => {
    if (!boutiqueId) { setPromos([]); return; }
    const cle = `promotions_${boutiqueId}`;
    const { data, error } = await supabase.from("promotions").select("*").eq("boutique_id", boutiqueId).order("created_at", { ascending: false });
    if (error) { setPromos(estIndisponible(error) ? lireLocal(cle) : []); return; }
    setPromos(fusionnerLocal(cle, data));
  }, [boutiqueId]);
  useEffect(() => { charger(); }, [charger]);

  const ajouterArt = (p) => { if (p && !arts.includes(p.nom)) setArts(a => [...a, p.nom]); };
  const retirerArt = (nom) => setArts(a => a.filter(x => x !== nom));

  const enregistrer = async () => {
    const pourcent = parseInt(pct) || 0;
    if (pourcent <= 0 || pourcent > 100) { onStatut && onStatut("⚠️ Pourcentage invalide (1-100)."); return; }
    if (arts.length === 0) { onStatut && onStatut("⚠️ Choisis au moins un article."); return; }
    if (fin < debut) { onStatut && onStatut("⚠️ La date de fin doit suivre le début."); return; }
    setEnCours(true);
    const row = { boutique_id: boutiqueId, date_debut: debut, date_fin: fin, pourcentage: pourcent, notes: notes.trim() || null, produits: arts, cree_par: monNom };
    const { error } = await supabase.from("promotions").insert(row);
    setEnCours(false);
    if (error && !estIndisponible(error)) { onStatut && onStatut(msgErreur(error)); return; }
    // Table absente ou hors-ligne : on garde la promo en local, elle reste visible.
    if (error) ajouterLocal(`promotions_${boutiqueId}`, row);
    setCreation(false); setArts([]); setPct("10"); setNotes("");
    onStatut && onStatut("✅ Promotion créée.");
    charger(); onRefresh && onRefresh();
  };

  const supprimer = async (id) => {
    if (!confirm("Supprimer cette promotion ?")) return;
    if (estLocal(id)) supprimerLocal(`promotions_${boutiqueId}`, id);
    else {
      const { error } = await supabase.from("promotions").delete().eq("id", id);
      if (error && estIndisponible(error)) supprimerLocal(`promotions_${boutiqueId}`, id);
    }
    charger(); onRefresh && onRefresh();
  };

  const badge = (s) => {
    const m = { active: { c: C.green, t: "Active" }, programmee: { c: C.blue, t: "Programmée" }, expiree: { c: C.muted, t: "Expirée" } }[s];
    return <span style={{ background: m.c + "22", color: m.c, border: `1px solid ${m.c}55`, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>{m.t}</span>;
  };

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {!creation ? (
        <button onClick={() => setCreation(true)} style={{ width: "100%", padding: 11, marginBottom: 12, background: C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
          + Faire une nouvelle promo
        </button>
      ) : (
        <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.green}55`, padding: 14, marginBottom: 12 }}>
          <div style={{ fontWeight: "bold", color: C.text, fontSize: 13, marginBottom: 10 }}>🎉 Nouvelle promotion</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div><label style={lbl}>DÉBUT</label><input type="date" value={debut} onChange={e => setDebut(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>FIN</label><input type="date" value={fin} onChange={e => setFin(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>REMISE %</label><input type="number" min="1" max="100" value={pct} onChange={e => setPct(e.target.value)} style={inp} /></div>
          </div>
          <label style={lbl}>ARTICLES EN PROMO</label>
          <ProduitSelect produits={produits} value="" placeholder="Ajouter un article à la promo…" onSelect={ajouterArt} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
            {arts.map(nom => (
              <span key={nom} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "4px 10px", fontSize: 12, color: C.text }}>
                {nom} <span onClick={() => retirerArt(nom)} role="button" aria-label="Retirer l'article" style={{ color: C.red, cursor: "pointer", fontWeight: "bold", padding: "6px 8px", margin: "-6px -8px -6px -2px" }}>✕</span>
              </span>
            ))}
            {arts.length === 0 && <span style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>Aucun article sélectionné.</span>}
          </div>
          <label style={lbl}>NOTES (facultatif)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Soldes fin d'année" style={{ ...inp, width: "100%", marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setCreation(false); setArts([]); }} style={{ padding: "10px 14px", background: C.surface2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Annuler</button>
            <button onClick={enregistrer} disabled={enCours} style={{ flex: 1, padding: 10, background: enCours ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 14, cursor: "pointer" }}>{enCours ? "..." : "Lancer la promo"}</button>
          </div>
        </div>
      )}

      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>🎉 PROMOTIONS ({promos.length})</div>
        {promos.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucune promotion.</div>}
        {promos.map(p => (
          <div key={p.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 13, fontWeight: "bold" }}>−{p.pourcentage}% · {(p.produits || []).length} article(s)</div>
                <div style={{ color: C.muted, fontSize: 10 }}>{p.date_debut} → {p.date_fin}{p.notes ? ` · ${p.notes}` : ""}</div>
                <div style={{ color: C.muted, fontSize: 10, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{(p.produits || []).join(", ")}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                {badge(statutPromo(p))}
                <div><button onClick={() => supprimer(p.id)} aria-label="Supprimer la promotion" style={{ marginTop: 6, background: C.red + "18", color: C.red, border: `1px solid ${C.red}33`, borderRadius: 8, padding: "8px 12px", fontSize: 14, cursor: "pointer" }}>🗑️</button></div>
              </div>
            </div>

            {/* CAMPAGNE : affiche à partager + annonce WhatsApp aux clients */}
            {statutPromo(p) !== "expiree" && (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => partagerAffiche(p, produits, boutique, onStatut)}
                  style={{ flex: 1, padding: "8px 0", background: C.blue + "18", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
                  🖼️ Affiche
                </button>
                <button onClick={() => setAnnonceId(annonceId === p.id ? null : p.id)}
                  style={{ flex: 1.6, padding: "8px 0", background: "#25D36618", color: "#25D366", border: "1px solid #25D36644", borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
                  📢 Annoncer aux clients ({clientsConnus.filter(c => c.phone).length})
                </button>
              </div>
            )}
            {annonceId === p.id && (
              <div style={{ background: C.surface2, borderRadius: 8, border: "1px solid #25D36644", padding: 10, marginTop: 8 }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: "bold", marginBottom: 6 }}>MESSAGE ENVOYÉ (personnalisé par client)</div>
                <div style={{ background: C.surface, borderRadius: 8, padding: 10, fontSize: 12, color: C.text, marginBottom: 8, fontStyle: "italic" }}>
                  {texteAnnonce(p, "Koffi")}
                </div>
                {clientsConnus.filter(c => c.phone).length === 0 && (
                  <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun client avec un numéro de téléphone. Ajoute les numéros dans Suivi Client.</div>
                )}
                {clientsConnus.filter(c => c.phone).map(cl => (
                  <div key={cl.nom} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.text, fontSize: 13 }}>{cl.nom}</span>
                    {envoyes[`${p.id}_${cl.nom}`]
                      ? <span style={{ color: C.green, fontSize: 12, fontWeight: "bold" }}>✅ Envoyé</span>
                      : <button onClick={() => envoyerA(p, cl)}
                          style={{ background: "#25D36622", color: "#25D366", border: "1px solid #25D36644", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: "bold", cursor: "pointer" }}>
                          💬 Envoyer
                        </button>}
                  </div>
                ))}
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
