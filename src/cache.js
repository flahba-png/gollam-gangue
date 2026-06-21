// Cache local (localStorage) des données métier, pour consultation hors-ligne.
// On stocke le dernier instantané réussi par "périmètre" (boutique ou vue globale).
const cle = (scope) => `gollam_cache_${scope}`;

export const sauverCache = (scope, data) => {
  try { localStorage.setItem(cle(scope), JSON.stringify({ ...data, _ts: Date.now() })); } catch { /* quota plein : on ignore */ }
};

export const lireCache = (scope) => {
  try { const s = localStorage.getItem(cle(scope)); return s ? JSON.parse(s) : null; } catch { return null; }
};

// Libellé "il y a X" pour informer l'utilisateur de la fraîcheur des données en cache
export const ageCache = (ts) => {
  if (!ts) return "";
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
};
