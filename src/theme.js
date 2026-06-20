// Deux palettes : sombre (par défaut) et claire
const SOMBRE = {
  bg: "#0C1016", surface: "#161C24", surface2: "#1F2730", border: "#2A3441",
  green: "#1FD08A", red: "#FB6F6F", yellow: "#F5C451", blue: "#4FB5FF",
  text: "#EAF0F6", muted: "#8A97A6", purple: "#A78BFA",
};
const CLAIR = {
  bg: "#F2F5F8", surface: "#FFFFFF", surface2: "#EDF1F5", border: "#D7DEE6",
  green: "#0E9E6E", red: "#DC4F4A", yellow: "#B8860B", blue: "#2B7FD6",
  text: "#16202B", muted: "#5E6B78", purple: "#7C5CE0",
};

export const PALETTES = { sombre: SOMBRE, clair: CLAIR };
export const themeActuel = () => {
  try { return localStorage.getItem("gangue_theme") === "clair" ? "clair" : "sombre"; } catch { return "sombre"; }
};

// C est un objet vivant : on mute ses valeurs au changement de thème.
// Les styles inline (recalculés à chaque rendu) reflètent alors le thème courant.
export const C = { ...SOMBRE };

export const appliquerTheme = (nom) => {
  Object.assign(C, PALETTES[nom] || SOMBRE);
  try { localStorage.setItem("gangue_theme", nom); } catch { /* ignore */ }
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", nom);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", C.bg);
  }
};

// Applique le thème enregistré dès le chargement
appliquerTheme(themeActuel());

// ==========================================
// DEVISES (Franc CFA par défaut + autres devises africaines)
// ==========================================
export const DEVISES = [
  { code: "XOF", symbole: "F", nom: "Franc CFA Ouest (XOF)" },
  { code: "XAF", symbole: "FCFA", nom: "Franc CFA Central (XAF)" },
  { code: "GNF", symbole: "FG", nom: "Franc guinéen (GNF)" },
  { code: "GHS", symbole: "₵", nom: "Cedi ghanéen (GHS)" },
  { code: "NGN", symbole: "₦", nom: "Naira nigérian (NGN)" },
  { code: "CDF", symbole: "FC", nom: "Franc congolais (CDF)" },
  { code: "KES", symbole: "KSh", nom: "Shilling kényan (KES)" },
  { code: "ZAR", symbole: "R", nom: "Rand sud-africain (ZAR)" },
  { code: "MAD", symbole: "DH", nom: "Dirham marocain (MAD)" },
  { code: "DZD", symbole: "DA", nom: "Dinar algérien (DZD)" },
  { code: "TND", symbole: "DT", nom: "Dinar tunisien (TND)" },
  { code: "EGP", symbole: "£", nom: "Livre égyptienne (EGP)" },
  { code: "RWF", symbole: "FRw", nom: "Franc rwandais (RWF)" },
  { code: "USD", symbole: "$", nom: "Dollar US (USD)" },
  { code: "EUR", symbole: "€", nom: "Euro (EUR)" },
];

const DEVISE_KEY = "gangue_devise";
const deviseStockee = () => { try { return localStorage.getItem(DEVISE_KEY); } catch { return null; } };
export let DEVISE = DEVISES.find(d => d.code === deviseStockee()) || DEVISES[0];
export const appliquerDevise = (code) => {
  DEVISE = DEVISES.find(d => d.code === code) || DEVISES[0];
  try { localStorage.setItem(DEVISE_KEY, DEVISE.code); } catch { /* ignore */ }
};

// nb = nombre brut (sans devise) ; fmt = montant avec le symbole de la devise active
export const nb = (n) => Number(n || 0).toLocaleString("fr-FR");
export const fmt = (n) => `${nb(n)} ${DEVISE.symbole}`;
export const today = () => new Date().toLocaleDateString("fr-FR");
export const todayISO = () => new Date().toISOString().split("T")[0];
export const heure = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

// Seuil (en jours) au-delà duquel une créance est considérée "en retard"
export const SEUIL_RETARD = 30;

// Âge en jours d'un enregistrement : priorité à created_at, sinon date fr (jj/mm/aaaa)
export const ageEnJours = (rec) => {
  let d = null;
  if (rec?.created_at) d = new Date(rec.created_at);
  else if (rec?.date && /^\d{2}\/\d{2}\/\d{4}$/.test(rec.date)) {
    const [j, m, a] = rec.date.split("/");
    d = new Date(`${a}-${m}-${j}T12:00:00`);
  }
  if (!d || isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
};

// ==========================================
// MODES DE PAIEMENT (Côte d'Ivoire)
// ==========================================
export const MODES_PAIEMENT = [
  { id: "especes", label: "Espèces", emoji: "💵", color: "#00A884" },
  { id: "wave", label: "Wave", emoji: "🌊", color: "#1DC8FF" },
  { id: "orange", label: "Orange Money", emoji: "🟠", color: "#FF7900" },
  { id: "mtn", label: "MTN MoMo", emoji: "🟡", color: "#FFCC00" },
  { id: "moov", label: "Moov Money", emoji: "🔵", color: "#0066CC" },
];

export const modePaiement = (id) =>
  MODES_PAIEMENT.find((m) => m.id === id) || MODES_PAIEMENT[0];

// ==========================================
// TÉLÉPHONE & WHATSAPP
// ==========================================
// Normalise un numéro au format international (chiffres, sans +) pour wa.me.
// Gère les numéros d'autres pays : on ne force 225 que pour un numéro local ivoirien.
export const normaliserTel = (tel) => {
  if (!tel) return "";
  const brut = String(tel).trim();
  const n = brut.replace(/[^\d]/g, "");
  if (!n) return "";
  if (brut.startsWith("+")) return n;          // international explicite (+33...)
  if (n.startsWith("00")) return n.slice(2);    // 00 = préfixe international
  if (n.startsWith("225")) return n;            // déjà Côte d'Ivoire
  if (n.length > 10) return n;                  // a déjà un indicatif pays
  return "225" + n;                             // numéro local ivoirien (10 chiffres)
};

// Lance un appel téléphonique via le composeur natif
export const appeler = (tel) => {
  if (!tel) return;
  const num = String(tel).replace(/[^\d+]/g, "");
  window.location.href = `tel:${num}`;
};

// Envoie un SMS pré-rempli (pour ceux qui n'ont pas WhatsApp) — marche à l'international
export const envoyerSMS = (tel, message) => {
  const num = "+" + normaliserTel(tel);
  // ?&body= maximise la compatibilité iOS + Android
  window.location.href = `sms:${num}?&body=${encodeURIComponent(message)}`;
};

// Ouvre WhatsApp avec un message pré-rempli
export const envoyerWhatsApp = (tel, message) => {
  const num = normaliserTel(tel);
  const url = num
    ? `https://wa.me/${num}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
};
