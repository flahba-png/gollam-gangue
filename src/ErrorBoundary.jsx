import React from "react";
import { logErreur } from "./monitoring";
import { msgErreur } from "./erreurs";

// Filet de sécurité : capture toute erreur de rendu et affiche un message
// lisible au lieu d'un écran noir. Permet aussi de vider le cache d'un clic.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(error) {
    return { erreur: error };
  }

  componentDidCatch(error, info) {
    console.error("Erreur capturée :", error, info);
    logErreur(error?.message || String(error), error?.stack || info?.componentStack);
  }

  reinitialiser = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const noms = await caches.keys();
        await Promise.all(noms.map((n) => caches.delete(n)));
      }
    } catch (e) { /* ignore */ }
    location.reload(true);
  };

  render() {
    if (this.state.erreur) {
      return (
        <div style={{ background: "#0C1016", color: "#EAF0F6", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
          <div style={{ maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
            <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8 }}>Un souci est survenu</div>
            <div style={{ fontSize: 13, color: "#8A97A6", marginBottom: 20 }}>
              L'app a rencontré une erreur. Recharge en vidant le cache — ça résout la plupart des cas.
            </div>
            <button onClick={this.reinitialiser}
              style={{ width: "100%", padding: 13, background: "#1FD08A", color: "#0C1016", border: "none", borderRadius: 10, fontWeight: "bold", fontSize: 15, cursor: "pointer", marginBottom: 12 }}>
              🔄 Recharger l'application
            </button>
            <div style={{ fontSize: 11, color: "#8A97A6", background: "#161C24", border: "1px solid #2A3441", borderRadius: 8, padding: 10, textAlign: "left", wordBreak: "break-word" }}>
              {msgErreur(this.state.erreur)}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
