import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { C } from "../theme";
import { t } from "../i18n";
import { supabase } from "../supabase";

// Chat d'équipe : canal groupe + discussions privées (DM), par boutique
export default function Chat({ boutiqueActive, userId, monNom, onStatut }) {
  const [messages, setMessages] = useState([]);
  const [membres, setMembres] = useState([]);
  const [canal, setCanal] = useState("groupe"); // "groupe" ou un user_id (DM)
  const [texte, setTexte] = useState("");
  const finRef = useRef(null);

  // Participants pour les DM : le patron + les employés actifs (sauf moi)
  const participants = useMemo(() => {
    const list = [];
    if (boutiqueActive?.proprietaire_id && boutiqueActive.proprietaire_id !== userId) {
      list.push({ id: boutiqueActive.proprietaire_id, nom: "Patron" });
    }
    membres.forEach(m => {
      if (m.user_id && m.user_id !== userId) list.push({ id: m.user_id, nom: m.nom || m.email });
    });
    return list;
  }, [membres, boutiqueActive, userId]);

  const charger = useCallback(async () => {
    if (!boutiqueActive) return;
    const [{ data: msgs }, { data: mbs }] = await Promise.all([
      supabase.from("messages").select("*").eq("boutique_id", boutiqueActive.id).order("created_at").limit(300),
      supabase.from("membres").select("user_id, nom, email").eq("boutique_id", boutiqueActive.id),
    ]);
    setMessages(msgs || []);
    setMembres(mbs || []);
  }, [boutiqueActive]);

  useEffect(() => { charger(); }, [charger]);

  // Temps réel
  useEffect(() => {
    if (!boutiqueActive) return;
    const channel = supabase.channel(`chat-${boutiqueActive.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `boutique_id=eq.${boutiqueActive.id}` },
        (payload) => setMessages((m) => m.some(x => x.id === payload.new.id) ? m : [...m, payload.new]))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [boutiqueActive]);

  // Messages du canal courant
  const messagesCanal = useMemo(() => messages.filter(m => {
    if (canal === "groupe") return !m.destinataire_id;
    return (m.expediteur_id === userId && m.destinataire_id === canal) ||
           (m.expediteur_id === canal && m.destinataire_id === userId);
  }), [messages, canal, userId]);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messagesCanal]);

  const nomCanal = canal === "groupe" ? `💬 ${t("equipe")}` : `🔒 ${participants.find(p => p.id === canal)?.nom || ""} (Privé)`;

  const envoyer = async (e) => {
    e.preventDefault();
    const tx = texte.trim();
    if (!tx || !boutiqueActive) return;
    setTexte("");
    const { error } = await supabase.from("messages").insert({
      boutique_id: boutiqueActive.id, expediteur_id: userId, expediteur_nom: monNom, texte: tx,
      destinataire_id: canal === "groupe" ? null : canal,
    });
    if (error) { onStatut && onStatut("❌ " + error.message); setTexte(tx); return; }
    charger();
  };

  const heureDe = (iso) => { try { return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  const ongletStyle = (actif) => ({
    padding: "6px 12px", borderRadius: 16, fontSize: 12, fontWeight: "bold", cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${actif ? C.green : C.border}`, background: actif ? C.green + "22" : "transparent", color: actif ? C.green : C.muted,
  });

  return (
    <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", height: "calc(100vh - 200px)" }}>
      {/* SÉLECTEUR DE CANAL */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 4 }}>
        <button onClick={() => setCanal("groupe")} style={ongletStyle(canal === "groupe")}>👥 {t("equipe")}</button>
        {participants.map(p => (
          <button key={p.id} onClick={() => setCanal(p.id)} style={ongletStyle(canal === p.id)}>🔒 {p.nom}</button>
        ))}
      </div>

      <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 12, flex: 1, overflowY: "auto", marginBottom: 10 }}>
        <div style={{ color: C.muted, fontSize: 11, fontWeight: "bold", textAlign: "center", marginBottom: 10 }}>
          {nomCanal}{canal === "groupe" ? ` · ${boutiqueActive?.nom}` : ""}
        </div>
        {messagesCanal.length === 0 && (
          <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>
            {canal === "groupe" ? t("aucun_message") : "Démarre la conversation privée 👇"}
          </div>
        )}
        {messagesCanal.map((m) => {
          const moi = m.expediteur_id === userId;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: moi ? "flex-end" : "flex-start", marginBottom: 8 }}>
              <div style={{ maxWidth: "78%", background: moi ? C.green + "22" : C.surface2, border: `1px solid ${moi ? C.green + "44" : C.border}`, borderRadius: 12, padding: "7px 11px" }}>
                {!moi && canal === "groupe" && <div style={{ color: C.blue, fontSize: 10, fontWeight: "bold", marginBottom: 2 }}>{m.expediteur_nom || "?"}</div>}
                <div style={{ color: C.text, fontSize: 13, wordBreak: "break-word" }}>{m.texte}</div>
                <div style={{ color: C.muted, fontSize: 9, textAlign: "right", marginTop: 2 }}>{heureDe(m.created_at)}</div>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      <form onSubmit={envoyer} style={{ display: "flex", gap: 8 }}>
        <input value={texte} onChange={(e) => setTexte(e.target.value)}
          placeholder={canal === "groupe" ? t("ecrire_message") : `🔒 Message privé à ${participants.find(p => p.id === canal)?.nom || ""}...`}
          style={{ flex: 1, padding: "11px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 20, color: C.text, fontSize: 13, outline: "none" }} />
        <button type="submit" style={{ width: 44, height: 44, background: C.green, color: C.bg, border: "none", borderRadius: "50%", fontSize: 16, fontWeight: "bold", cursor: "pointer" }}>➤</button>
      </form>
    </div>
  );
}
