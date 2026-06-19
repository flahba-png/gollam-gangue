// ============================================================
// SYSTÈME DE TRADUCTION (i18n) — fr = français, en = anglais
// ============================================================
import { TRADUCTIONS } from "./traductions";

export const LANGUES_DISPO = [
  { id: "fr", nom: "Français", drapeau: "🇫🇷" },
  { id: "en", nom: "English", drapeau: "🇬🇧" },
];

let langue = "fr";
try { const l = localStorage.getItem("gangue_langue"); if (l) langue = l; } catch { /* ignore */ }

export const langueActuelle = () => langue;

export const setLangue = (l) => {
  langue = l;
  try { localStorage.setItem("gangue_langue", l); } catch { /* ignore */ }
  if (typeof document !== "undefined") document.documentElement.setAttribute("lang", l);
};

// t("clef") → texte dans la langue courante, sinon français, sinon la clef
export const t = (clef) => {
  const e = TRADUCTIONS[clef];
  if (!e) return clef;
  return e[langue] || e.fr || clef;
};

if (typeof document !== "undefined") document.documentElement.setAttribute("lang", langue);
