// Retour sensoriel à la caisse : bip sonore + vibration

let ctx;
const getCtx = () => {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { ctx = null; }
  }
  return ctx;
};

// Bip court et clair (type "caisse enregistreuse")
export const bipVente = () => {
  // Vibration (Android)
  try { navigator.vibrate && navigator.vibrate(60); } catch { /* ignore */ }

  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === "suspended") c.resume();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, c.currentTime);
    o.frequency.setValueAtTime(1320, c.currentTime + 0.08);
    g.gain.setValueAtTime(0.18, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22);
    o.connect(g); g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.22);
  } catch { /* ignore */ }
};

// Petit bip d'erreur (grave)
export const bipErreur = () => {
  try { navigator.vibrate && navigator.vibrate([40, 40, 40]); } catch { /* ignore */ }
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === "suspended") c.resume();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(200, c.currentTime);
    g.gain.setValueAtTime(0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
    o.connect(g); g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.25);
  } catch { /* ignore */ }
};
