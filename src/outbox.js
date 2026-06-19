// File d'attente persistante des opérations faites hors-ligne.
// Stockée dans localStorage pour survivre à une fermeture de l'app.
const KEY = "gangue_outbox";

export const lireOutbox = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
};

const ecrire = (arr) => localStorage.setItem(KEY, JSON.stringify(arr));

// Ajoute une opération à la file ; retourne la nouvelle taille
export const ajouterOutbox = (item) => {
  const a = lireOutbox();
  a.push(item);
  ecrire(a);
  return a.length;
};

export const retirerOutbox = (id) => {
  ecrire(lireOutbox().filter((x) => x.id !== id));
};

export const tailleOutbox = () => lireOutbox().length;
