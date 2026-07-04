import React, { useEffect, useRef, useState } from "react";
import { C } from "../theme";

// Modal de scan code-barres via la caméra arrière du téléphone.
// La librairie html5-qrcode (~350 Ko) est chargée dynamiquement à l'ouverture
// du scanner, pour ne pas alourdir le démarrage de l'app.
// Robuste : si la caméra est refusée/indisponible, on affiche un message
// au lieu de planter (toutes les opérations html5-qrcode sont protégées).
export default function Scanner({ onScan, onClose }) {
  const [erreur, setErreur] = useState("");
  const scannerRef = useRef(null);
  const scanneRef = useRef(false); // évite les doubles lectures

  useEffect(() => {
    let annule = false;
    let stopper = async () => {};

    import("html5-qrcode").then(({ Html5Qrcode, Html5QrcodeScannerState }) => {
      if (annule) return;

      // Arrête proprement le scanner sans jamais lever d'erreur
      stopper = async () => {
        const scanner = scannerRef.current;
        if (!scanner) return;
        try {
          const etat = scanner.getState && scanner.getState();
          if (etat === Html5QrcodeScannerState.SCANNING || etat === Html5QrcodeScannerState.PAUSED) {
            await scanner.stop();
          }
        } catch { /* ignore */ }
        try { scanner.clear(); } catch { /* ignore */ }
      };

      const scanner = new Html5Qrcode("reader");
      scannerRef.current = scanner;

      scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 160 } },
        (decodedText) => {
          if (scanneRef.current) return;
          scanneRef.current = true;
          stopper().finally(() => onScan(decodedText));
        },
        () => {} // erreurs de frame ignorées
      ).catch((e) => {
        console.warn("Caméra indisponible :", e?.message || e);
        setErreur("Caméra indisponible. Autorise l'accès à la caméra dans ton navigateur, ou saisis le produit manuellement.");
      });
    }).catch(() => setErreur("Scanner indisponible. Vérifie ta connexion puis réessaie."));

    return () => { annule = true; stopper(); };
  }, [onScan]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ color: C.text, fontSize: 14, fontWeight: "bold", marginBottom: 14 }}>📷 Vise le code-barres</div>

      <div id="reader" style={{ width: "100%", maxWidth: 340, borderRadius: 12, overflow: "hidden", background: "#000", minHeight: 120 }} />

      {erreur && (
        <div style={{ color: C.red, fontSize: 12, textAlign: "center", marginTop: 14, maxWidth: 300 }}>{erreur}</div>
      )}

      <button onClick={onClose}
        style={{ marginTop: 22, padding: "10px 28px", background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontWeight: "bold", cursor: "pointer" }}>
        Fermer
      </button>
    </div>
  );
}
