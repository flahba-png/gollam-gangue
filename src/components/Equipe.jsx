import React, { useState, useMemo } from "react";
import { C, fmt, MODES_PAIEMENT, appeler, envoyerWhatsApp } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";
import { CATEGORIES_PERMS, PERMS_VENDEUR, PERMS_GERANT } from "../permissions";

// Gestion des employés d'une boutique + caisse par vendeur
export default function Equipe({ boutiqueActive, proprietaireId, historique, onStatut }) {
  const [membres, setMembres] = useState([]);
  const [email, setEmail] = useState("");
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [role, setRole] = useState("vendeur");
  const [perms, setPerms] = useState(PERMS_VENDEUR);
  const [accesOuvert, setAccesOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);

  // Choisir un rôle applique un preset (Vendeur = sans finances, Gérant = tout)
  const choisirRole = (r) => {
    setRole(r);
    setPerms(r === "gerant" ? { ...PERMS_GERANT } : { ...PERMS_VENDEUR });
  };
  const togglePerm = (id) => setPerms(p => ({ ...p, [id]: !p[id] }));

  const charger = React.useCallback(async () => {
    if (!boutiqueActive) return;
    const { data } = await supabase.from("membres").select("*").eq("boutique_id", boutiqueActive.id).order("created_at");
    setMembres(data || []);
  }, [boutiqueActive]);

  React.useEffect(() => { charger(); }, [charger]);

  const ajouter = async () => {
    if (!email.trim() || !nom.trim()) { onStatut("⚠️ Renseigne le nom et l'email."); return; }
    setEnCours(true);
    const { error } = await supabase.from("membres").insert({
      boutique_id: boutiqueActive.id,
      proprietaire_id: proprietaireId,
      email: email.trim().toLowerCase(),
      nom: nom.trim(),
      telephone: tel.trim(),
      role,
      permissions: perms,
    });
    setEnCours(false);
    if (error) { onStatut("❌ " + error.message); return; }
    setEmail(""); setNom(""); setTel(""); setRole("vendeur"); setPerms({ ...PERMS_VENDEUR }); setAccesOuvert(false);
    onStatut(`✅ ${nom.trim()} ajouté. Il doit créer un compte employé avec cet email pour accéder.`);
    charger();
  };

  const retirer = async (m) => {
    if (!confirm(`Retirer ${m.nom} de cette boutique ?`)) return;
    await supabase.from("membres").delete().eq("id", m.id);
    onStatut(`${m.nom} retiré.`);
    charger();
  };

  // Caisse par vendeur (ventes de la boutique active)
  const caisseParVendeur = useMemo(() => {
    const map = new Map();
    historique.forEach(h => {
      if (h.type !== "vente" && h.type !== "retour") return;
      const v = h.vendeur_nom || "Patron";
      if (!map.has(v)) map.set(v, { nom: v, total: 0, nb: 0, modes: {} });
      const e = map.get(v);
      const signe = h.type === "retour" ? -1 : 1;
      e.total += signe * (h.montant || 0);
      if (h.type === "vente") e.nb += 1;
      const mp = h.mode_paiement || "especes";
      e.modes[mp] = (e.modes[mp] || 0) + signe * (h.montant || 0);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [historique]);

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {/* AJOUTER UN EMPLOYÉ */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>➕ {t("ajouter_employe").toUpperCase()}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom de l'employé" style={inp} />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email de l'employé" style={inp} />
          <input type="tel" value={tel} onChange={e => setTel(e.target.value)} placeholder="📱 Téléphone (pour appeler)" style={inp} />
          <div style={{ display: "flex", gap: 6 }}>
            {[{ id: "vendeur", label: "Vendeur" }, { id: "gerant", label: "Gérant" }].map(r => (
              <button key={r.id} type="button" onClick={() => choisirRole(r.id)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer",
                  border: `1px solid ${role === r.id ? C.green : C.border}`,
                  background: role === r.id ? C.green + "22" : "transparent",
                  color: role === r.id ? C.green : C.muted }}>
                {r.label}
              </button>
            ))}
          </div>

          {/* ACCORDÉON : PERSONNALISER LES ACCÈS */}
          <button type="button" onClick={() => setAccesOuvert(o => !o)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 10px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", color: C.text, fontSize: 12, fontWeight: "bold" }}>
            <span>🛠️ Personnaliser les accès de l'employé</span>
            <span style={{ color: C.muted }}>{accesOuvert ? "▲" : "▼"}</span>
          </button>
          {accesOuvert && (
            <div style={{ background: C.surface2, borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
              {CATEGORIES_PERMS.map(cat => (
                <div key={cat.titre}>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: "bold", marginBottom: 4 }}>{cat.titre}</div>
                  {cat.perms.map(p => (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer", fontSize: 12, color: C.text }}>
                      <input type="checkbox" checked={!!perms[p.id]} onChange={() => togglePerm(p.id)} style={{ width: 16, height: 16, accentColor: C.green }} />
                      {p.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 10, color: C.muted }}>
            Le <b>vendeur</b> encaisse sans voir tes bénéfices. Le <b>gérant</b> a tout. Tu peux ajuster au cas par cas ci-dessus.
          </div>
          <button onClick={ajouter} disabled={enCours}
            style={{ padding: 11, background: enCours ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
            {enCours ? "..." : "Ajouter l'employé"}
          </button>
        </div>
      </div>

      {/* LISTE DES EMPLOYÉS */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14, marginBottom: 12 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>🧑‍🤝‍🧑 ÉQUIPE ({membres.length})</div>
        {membres.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucun employé sur cette boutique.</div>}
        {membres.map(m => (
          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: C.green }}>
                {m.nom?.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ color: C.text, fontSize: 13, fontWeight: "bold" }}>{m.nom}</div>
                <div style={{ color: C.muted, fontSize: 10 }}>{m.telephone ? `📱 ${m.telephone} · ` : ""}{m.user_id ? "actif" : "en attente"}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {m.telephone && (
                <>
                  <button onClick={() => appeler(m.telephone)} title="Appeler" style={{ background: C.green + "22", color: C.green, border: `1px solid ${C.green}44`, padding: "4px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>📞</button>
                  <button onClick={() => envoyerWhatsApp(m.telephone, `Bonjour ${m.nom}`)} title="WhatsApp" style={{ background: "#25D36622", color: "#25D366", border: "1px solid #25D36644", padding: "4px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>💬</button>
                </>
              )}
              <span style={{ background: (m.role === "gerant" ? C.purple : C.blue) + "22", color: m.role === "gerant" ? C.purple : C.blue, border: `1px solid ${(m.role === "gerant" ? C.purple : C.blue)}55`, borderRadius: 12, padding: "2px 8px", fontSize: 10, fontWeight: "bold" }}>
                {m.role}
              </span>
              <button onClick={() => retirer(m)} style={{ background: C.red + "22", color: C.red, border: `1px solid ${C.red}44`, padding: "2px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer" }}>
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* CAISSE PAR VENDEUR */}
      <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>💰 {t("caisse_par_vendeur").toUpperCase()}</div>
        {caisseParVendeur.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucune vente enregistrée.</div>}
        {caisseParVendeur.map(v => (
          <div key={v.nom} style={{ padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: "bold" }}>{v.nom === "Patron" ? "🏪 Patron" : `👤 ${v.nom}`}</div>
              <div style={{ color: C.green, fontWeight: "bold", fontSize: 13 }}>{fmt(v.total)}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <span style={{ color: C.muted, fontSize: 10 }}>{v.nb} vente(s)</span>
              {MODES_PAIEMENT.filter(mp => v.modes[mp.id] > 0).map(mp => (
                <span key={mp.id} style={{ color: mp.color, fontSize: 10 }}>
                  {mp.emoji} {fmt(v.modes[mp.id])}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inp = {
  width: "100%", padding: "9px 12px", background: C.surface2,
  border: `1px solid ${C.border}`, borderRadius: 8, color: C.text,
  fontSize: 13, boxSizing: "border-box", outline: "none",
};
