import React, { useState, useEffect, useCallback, useMemo } from "react";
import { C, today, envoyerWhatsApp, appeler } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";

export default function Fournisseurs({ produits, boutiqueActive, onRefresh, onStatut, boutique }) {
  const [fournisseurs, setFournisseurs] = useState([]);
  const [commandes, setCommandes] = useState([]);
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [qtes, setQtes] = useState({}); // quantités de réassort éditables par produit

  const charger = useCallback(async () => {
    if (!boutiqueActive) return;
    const [{ data: f }, { data: c }] = await Promise.all([
      supabase.from("fournisseurs").select("*").eq("boutique_id", boutiqueActive.id).order("nom"),
      supabase.from("commandes").select("*").eq("boutique_id", boutiqueActive.id).eq("statut", "en_cours").order("created_at", { ascending: false }),
    ]);
    setFournisseurs(f || []);
    setCommandes(c || []);
  }, [boutiqueActive]);

  useEffect(() => { charger(); }, [charger]);

  const nomF = (id) => fournisseurs.find(f => f.id === id)?.nom || "Sans fournisseur";
  const telF = (id) => fournisseurs.find(f => f.id === id)?.telephone || "";

  const ajouterFournisseur = async () => {
    if (!nom.trim()) { onStatut("⚠️ Nom du fournisseur requis."); return; }
    await supabase.from("fournisseurs").insert({ boutique_id: boutiqueActive.id, nom: nom.trim(), telephone: tel.trim() });
    setNom(""); setTel("");
    onStatut("✅ Fournisseur ajouté.");
    charger();
  };

  const supprimerFournisseur = async (id) => {
    if (!confirm("Supprimer ce fournisseur ?")) return;
    await supabase.from("fournisseurs").delete().eq("id", id);
    charger();
  };

  // Produits sous le seuil d'alerte, groupés par fournisseur
  const reassort = useMemo(() => {
    const bas = produits.filter(p => (p.stock || 0) <= (p.seuil_alerte ?? 2));
    const groupes = {};
    bas.forEach(p => {
      const key = p.fournisseur_id || "sans";
      if (!groupes[key]) groupes[key] = [];
      groupes[key].push(p);
    });
    return groupes;
  }, [produits]);

  const qteDe = (p) => qtes[p.id] ?? Math.max((p.seuil_alerte ?? 2) * 2, 1);

  const commander = async (fId, liste) => {
    const lignes = liste.map(p => ({ nom: p.nom, quantite: parseInt(qteDe(p)) || 1, prix_achat: p.prix_achat || 0 }));
    const total = lignes.reduce((s, l) => s + l.quantite * l.prix_achat, 0);

    await supabase.from("commandes").insert({
      boutique_id: boutiqueActive.id,
      fournisseur_id: fId === "sans" ? null : fId,
      fournisseur_nom: fId === "sans" ? "Sans fournisseur" : nomF(fId),
      lignes, total, statut: "en_cours", date: today(),
    });

    // Message de commande au fournisseur
    const corps = lignes.map(l => `• ${l.quantite}x ${l.nom}`).join("\n");
    const msg =
      `Bonjour ${fId === "sans" ? "" : nomF(fId)} 👋\n\n` +
      `Commande de *${boutique?.nom || "notre boutique"}* :\n${corps}\n\n` +
      `Merci de me confirmer la disponibilité. 🙏`;
    envoyerWhatsApp(telF(fId), msg);

    onStatut("✅ Commande enregistrée et envoyée.");
    charger();
  };

  const recevoir = async (cmd) => {
    for (const l of cmd.lignes) {
      const { data: existant } = await supabase.from("produits")
        .select("*").eq("boutique_id", boutiqueActive.id).ilike("nom", l.nom).maybeSingle();
      if (existant) {
        await supabase.from("produits").update({ stock: (existant.stock || 0) + l.quantite }).eq("id", existant.id);
      } else {
        await supabase.from("produits").insert({ boutique_id: boutiqueActive.id, nom: l.nom, prix_achat: l.prix_achat || 0, prix_vente: 0, stock: l.quantite });
      }
    }
    await supabase.from("commandes").update({ statut: "recue" }).eq("id", cmd.id);
    onStatut("✅ Commande reçue, stock mis à jour.");
    charger(); onRefresh();
  };

  const annuler = async (cmd) => {
    if (!confirm("Annuler cette commande ?")) return;
    await supabase.from("commandes").update({ statut: "annulee" }).eq("id", cmd.id);
    charger();
  };

  const cles = Object.keys(reassort);

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {/* COMMANDES EN COURS */}
      {commandes.length > 0 && (
        <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.yellow}55`, padding: 14, marginBottom: 12 }}>
          <div style={{ color: C.yellow, fontWeight: "bold", fontSize: 12, marginBottom: 10 }}>📦 {t("commandes_cours").toUpperCase()} ({commandes.length})</div>
          {commandes.map(cmd => (
            <div key={cmd.id} style={{ background: C.surface2, borderRadius: 8, padding: 12, marginBottom: 8, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: C.text, fontWeight: "bold", fontSize: 13 }}>{cmd.fournisseur_nom}</span>
                <span style={{ color: C.muted, fontSize: 10 }}>{cmd.date}</span>
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>
                {cmd.lignes.map(l => `${l.quantite}x ${l.nom}`).join(" · ")}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => recevoir(cmd)}
                  style={{ flex: 1, padding: "7px 0", background: C.green, color: C.bg, border: "none", borderRadius: 6, fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>
                  ✅ Marquer reçue
                </button>
                <button onClick={() => annuler(cmd)}
                  style={{ padding: "7px 12px", background: C.red + "22", color: C.red, border: `1px solid ${C.red}44`, borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
                  Annuler
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RÉASSORT SUGGÉRÉ */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>🔔 {t("reassort_suggere").toUpperCase()}</div>
        {cles.length === 0 ? (
          <div style={{ color: C.green, fontSize: 12, fontStyle: "italic" }}>👍 Aucun produit sous le seuil. Stock OK.</div>
        ) : (
          cles.map(fId => (
            <div key={fId} style={{ marginBottom: 14 }}>
              <div style={{ color: fId === "sans" ? C.muted : C.blue, fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>
                {fId === "sans" ? "⚠️ Sans fournisseur assigné" : `🚚 ${nomF(fId)}`}
              </div>
              {reassort[fId].map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ color: C.text, fontSize: 13 }}>{p.nom}</div>
                    <div style={{ color: C.red, fontSize: 10 }}>Stock : {p.stock || 0} (seuil {p.seuil_alerte ?? 2})</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: C.muted, fontSize: 10 }}>commander</span>
                    <input type="number" inputMode="numeric" min="1" value={qteDe(p)}
                      onChange={e => setQtes(prev => ({ ...prev, [p.id]: e.target.value }))}
                      style={{ width: 52, padding: "5px 6px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12, textAlign: "center" }} />
                  </div>
                </div>
              ))}
              {fId !== "sans" && (
                <button onClick={() => commander(fId, reassort[fId])}
                  style={{ width: "100%", marginTop: 8, padding: "8px 0", background: "#25D366", color: "#fff", border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 12, cursor: "pointer" }}>
                  💬 Commander via WhatsApp
                </button>
              )}
              {fId === "sans" && (
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                  Assigne un fournisseur à ces produits (onglet Stock → ✏️) pour pouvoir commander.
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* GESTION FOURNISSEURS */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>🚚 MES FOURNISSEURS ({fournisseurs.length})</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom"
            style={{ flex: 1, padding: "8px 10px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }} />
          <input value={tel} onChange={e => setTel(e.target.value)} placeholder="Téléphone" type="tel"
            style={{ flex: 1, padding: "8px 10px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }} />
          <button onClick={ajouterFournisseur}
            style={{ padding: "8px 12px", background: C.green, color: C.bg, border: "none", borderRadius: 6, fontWeight: "bold", cursor: "pointer", fontSize: 12 }}>
            +
          </button>
        </div>
        {fournisseurs.map(f => (
          <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
            <div>
              <div style={{ color: C.text }}>{f.nom}</div>
              {f.telephone && <div style={{ color: C.muted, fontSize: 10 }}>📱 {f.telephone}</div>}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {f.telephone && (
                <>
                  <button onClick={() => appeler(f.telephone)} title="Appeler" style={{ background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, padding: "4px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>📞</button>
                  <button onClick={() => envoyerWhatsApp(f.telephone, `Bonjour ${f.nom}`)} title="WhatsApp" style={{ background: "#25D36622", color: "#25D366", border: "1px solid #25D36644", padding: "4px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>💬</button>
                </>
              )}
              <button onClick={() => supprimerFournisseur(f.id)} style={{ background: C.red + "22", color: C.red, border: `1px solid ${C.red}44`, padding: "2px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>🗑️</button>
            </div>
          </div>
        ))}
        {fournisseurs.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun fournisseur. Ajoute-en un pour activer le réassort.</div>}
      </div>
    </div>
  );
}
