import React, { useState, useEffect, useRef, useMemo } from "react";
import { C } from "../theme";
import { supabase } from "../supabase";
import { msgErreur } from "../erreurs";

// Surveillance vidéo : liste de caméras (par boutique) + lecteur HLS/M3U8.
// hls.js est chargé dynamiquement (uniquement à l'ouverture) pour ne pas alourdir l'app.
export default function Surveillance({ boutiqueActive, estPatron = false, onRefresh, onClose }) {
  const cameras = useMemo(() => Array.isArray(boutiqueActive?.cameras) ? boutiqueActive.cameras : [], [boutiqueActive]);
  const [active, setActive] = useState(0);
  const [gestion, setGestion] = useState(cameras.length === 0 && estPatron);
  const [liste, setListe] = useState(cameras.length ? cameras.map(c => ({ ...c })) : [{ nom: "", url: "" }]);
  const [sauve, setSauve] = useState(false);
  const [err, setErr] = useState("");
  const videoRef = useRef(null);

  const urlActive = cameras[active]?.url || "";

  // Charge le flux dans la balise <video> (HLS natif Safari, sinon hls.js)
  useEffect(() => {
    if (gestion) return;
    const video = videoRef.current;
    if (!video || !urlActive) return;
    setErr("");
    if (/^rtsp:/i.test(urlActive)) {
      setErr("Les flux RTSP ne se lisent pas directement dans un navigateur. Utilise l'URL HLS/M3U8 de ta caméra (souvent fournie par l'app du fabricant ou un convertisseur).");
      return;
    }
    let hls;
    let annule = false;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = urlActive;
      video.play?.().catch(() => {});
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (annule) return;
        if (Hls.isSupported()) {
          hls = new Hls({ lowLatencyMode: true });
          hls.loadSource(urlActive);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_e, d) => { if (d?.fatal) setErr("Flux indisponible ou format non supporté."); });
          video.play?.().catch(() => {});
        } else {
          video.src = urlActive; // dernier recours
        }
      }).catch(() => setErr("Lecteur vidéo indisponible."));
    }
    return () => { annule = true; if (hls) hls.destroy(); };
  }, [urlActive, gestion]);

  const majLigne = (i, champ, val) => setListe(l => l.map((c, j) => j === i ? { ...c, [champ]: val } : c));
  const ajouterLigne = () => setListe(l => [...l, { nom: "", url: "" }]);
  const retirerLigne = (i) => setListe(l => l.filter((_, j) => j !== i));

  const sauvegarder = async () => {
    if (!boutiqueActive) return;
    setSauve(true);
    const propres = liste.map(c => ({ nom: (c.nom || "").trim(), url: (c.url || "").trim() })).filter(c => c.nom && c.url);
    const { error } = await supabase.from("boutiques").update({ cameras: propres }).eq("id", boutiqueActive.id);
    setSauve(false);
    if (error) { setErr(msgErreur(error, "L'enregistrement")); return; }
    onRefresh && onRefresh();
    setActive(0);
    setGestion(false);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, width: "100%", maxWidth: 540, marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: "bold", color: C.text }}>👁️ Surveillance — {boutiqueActive?.nom || ""}</div>
          <button onClick={onClose} aria-label="Fermer" style={{ width: 40, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        {gestion ? (
          // ---------- GESTION DES CAMÉRAS (patron) ----------
          <div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
              Ajoute tes caméras. Pour chacune : un nom et l'URL du flux <b style={{ color: C.text }}>HLS / M3U8</b>.
            </div>
            {liste.map((c, i) => (
              <div key={i} style={{ background: C.surface2, borderRadius: 8, border: `1px solid ${C.border}`, padding: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <input value={c.nom} onChange={e => majLigne(i, "nom", e.target.value)} placeholder="Nom (ex: Caisse Boutique)"
                    style={{ flex: 1, padding: "8px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
                  <button onClick={() => retirerLigne(i)} title="Retirer"
                    style={{ background: C.red + "22", color: C.red, border: `1px solid ${C.red}44`, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>🗑️</button>
                </div>
                <input value={c.url} onChange={e => majLigne(i, "url", e.target.value)} placeholder="URL du flux (https://.../stream.m3u8)"
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 12 }} />
              </div>
            ))}
            <button onClick={ajouterLigne}
              style={{ width: "100%", padding: 9, marginBottom: 10, background: C.blue + "18", color: C.blue, border: `1px solid ${C.blue}44`, borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" }}>
              ➕ Ajouter une caméra
            </button>
            {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              {cameras.length > 0 && (
                <button onClick={() => { setListe(cameras.map(c => ({ ...c }))); setGestion(false); }}
                  style={{ padding: "10px 14px", background: C.surface2, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Annuler</button>
              )}
              <button onClick={sauvegarder} disabled={sauve}
                style={{ flex: 1, padding: 10, background: sauve ? C.muted : C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 14, cursor: "pointer" }}>
                {sauve ? "..." : "✅ Enregistrer les caméras"}
              </button>
            </div>
          </div>
        ) : (
          // ---------- VISIONNAGE ----------
          <div>
            {/* Sélecteur de caméra (onglets) */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
              {cameras.map((c, i) => (
                <button key={i} onClick={() => setActive(i)}
                  style={{ whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 16, fontSize: 12, fontWeight: "bold", cursor: "pointer",
                    border: `1px solid ${active === i ? C.green : C.border}`, background: active === i ? C.green + "22" : "transparent", color: active === i ? C.green : C.muted }}>
                  📹 {c.nom || `Caméra ${i + 1}`}
                </button>
              ))}
            </div>

            <div style={{ background: "#000", borderRadius: 10, overflow: "hidden", position: "relative", aspectRatio: "16 / 9" }}>
              <video ref={videoRef} controls autoPlay muted playsInline
                style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
            </div>
            {err && <div style={{ color: C.yellow, fontSize: 12, marginTop: 8 }}>⚠️ {err}</div>}
            <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
              Flux en direct de « {cameras[active]?.nom} ». La latence dépend de ta caméra et de ta connexion.
            </div>

            {estPatron && (
              <button onClick={() => { setListe(cameras.length ? cameras.map(c => ({ ...c })) : [{ nom: "", url: "" }]); setGestion(true); }}
                style={{ width: "100%", padding: 9, marginTop: 12, background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                ⚙️ Gérer les caméras
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
