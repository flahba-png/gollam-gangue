import React, { useState, useEffect } from "react";
import { C } from "../theme";

const KEY_FERME = "gangue_install_ferme";

// Bandeau "Installer l'application" — Android (1 tap) ou iPhone (instructions)
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [estIOS, setEstIOS] = useState(false);

  useEffect(() => {
    // Déjà installée ? on ne montre rien
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (standalone) return;
    if (localStorage.getItem(KEY_FERME) === "1") return;

    const ua = window.navigator.userAgent || "";
    const ios = /iphone|ipad|ipod/i.test(ua);

    if (ios) {
      // iOS ne déclenche pas d'événement → on affiche les instructions
      setEstIOS(true);
      setVisible(true);
      return;
    }

    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const installer = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  const fermer = () => {
    localStorage.setItem(KEY_FERME, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 300, padding: "8px 10px", boxSizing: "border-box" }}>
      <div style={{ background: C.surface, border: `1px solid ${C.green}66`, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.45)" }}>
        <div style={{ fontSize: 26 }}>📲</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontSize: 13, fontWeight: "bold" }}>Installer Gangué</div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>
            {estIOS
              ? "Appuie sur Partager ⬆️ puis « Sur l'écran d'accueil »"
              : "Ajoute l'app à ton écran d'accueil"}
          </div>
        </div>
        {!estIOS && (
          <button onClick={installer}
            style={{ background: C.green, color: C.bg, border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: "bold", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
            Installer
          </button>
        )}
        <button onClick={fermer}
          style={{ background: "transparent", color: C.muted, border: "none", fontSize: 18, cursor: "pointer", padding: "0 4px" }}>
          ✕
        </button>
      </div>
    </div>
  );
}
