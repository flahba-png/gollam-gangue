import { fmt, envoyerWhatsApp, envoyerSMS } from "./theme";

// Source unique du message de relance d'un client (utilisé partout dans l'app).
export const messageRelance = ({ nom, article, total, avance, reste }, boutique) => {
  const l = [`Bonjour ${nom || ""} 👋`, ``, `Rappel de *${boutique?.nom || "notre boutique"}*.`];
  if (article) l.push(`Article : ${article}`);
  if (total != null) l.push(`Montant total : ${fmt(total)}`);
  if (avance != null) l.push(`Déjà payé : ${fmt(avance)}`);
  l.push(`Reste à payer : *${fmt(reste)}*`, ``, `Merci de régulariser quand vous pouvez. 🙏`);
  return l.join("\n");
};

export const relancerWhatsApp = (infos, boutique) => envoyerWhatsApp(infos.phone, messageRelance(infos, boutique));
export const relancerSMS = (infos, boutique) => envoyerSMS(infos.phone, messageRelance(infos, boutique));
