// Balance intelligente pour l'achat de cultures commerciales (cacao, café,
// anacarde, coton…). Aucune dépendance à React : calculs testables isolément.
//
// Principe du « bord champ » : on pèse les sacs du producteur, on retire la
// tare des sacs, on applique la réfaction humidité et impuretés, puis on paie
// le poids net au prix du kilo (+ prime qualité éventuelle).

// Cultures courantes en Afrique de l'Ouest avec leurs normes usuelles
// (humidité maximale admise, impuretés tolérées). Modifiables à la pesée.
export const CULTURES = [
  { id: "cacao", nom: "Cacao", emoji: "🍫", humiditeNorme: 8, impuretesNorme: 1.5 },
  { id: "cafe", nom: "Café", emoji: "☕", humiditeNorme: 12.5, impuretesNorme: 1 },
  { id: "anacarde", nom: "Anacarde", emoji: "🥜", humiditeNorme: 10, impuretesNorme: 1 },
  { id: "coton", nom: "Coton graine", emoji: "☁️", humiditeNorme: 8, impuretesNorme: 2 },
  { id: "hevea", nom: "Hévéa (caoutchouc)", emoji: "🌳", humiditeNorme: 0, impuretesNorme: 0 },
  { id: "arachide", nom: "Arachide", emoji: "🥜", humiditeNorme: 9, impuretesNorme: 2 },
  { id: "karite", nom: "Karité (amandes)", emoji: "🌰", humiditeNorme: 7, impuretesNorme: 2 },
  { id: "sesame", nom: "Sésame", emoji: "🌾", humiditeNorme: 7, impuretesNorme: 2 },
  { id: "soja", nom: "Soja", emoji: "🫘", humiditeNorme: 13, impuretesNorme: 2 },
  { id: "mais", nom: "Maïs", emoji: "🌽", humiditeNorme: 14, impuretesNorme: 2 },
];

// Poids d'un sac vide (tare) selon l'emballage
export const SACS = [
  { id: "jute", nom: "Jute", tare: 1 },
  { id: "polypro", nom: "Polypropylène", tare: 0.2 },
  { id: "aucun", nom: "Vrac / sans sac", tare: 0 },
];

// Grades qualité : ajustement du prix du kilo (en %)
export const GRADES = [
  { id: "g1", nom: "Grade 1", ajustement: 0 },
  { id: "g2", nom: "Grade 2", ajustement: -5 },
  { id: "hs", nom: "Hors standard", ajustement: -15 },
];

const arrondi = (n, d = 2) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};
const pos = (n) => Math.max(0, Number(n) || 0);

// Calcul complet d'un ticket de pesée.
//  - pesees       : liste des poids bruts lus sur la balance (kg)
//  - nbSacs, tareSac : nombre de sacs et poids d'un sac vide
//  - humidite / humiditeNorme : % mesuré (humidimètre) et % admis
//  - impuretes / impuretesNorme : % de déchets mesuré et % toléré
//  - prixKg, ajustementGrade (%), primeKg (prime certification, F/kg)
// La réfaction humidité suit la formule de la matière sèche :
//   net = poids × (100 − H) / (100 − Hnorme)   si H > Hnorme
export const calculerPesee = ({
  pesees = [], nbSacs = 0, tareSac = 0,
  humidite = 0, humiditeNorme = 0,
  impuretes = 0, impuretesNorme = 0,
  prixKg = 0, ajustementGrade = 0, primeKg = 0,
}) => {
  const brut = arrondi(pesees.reduce((s, p) => s + pos(p), 0));
  const tare = arrondi(pos(nbSacs) * pos(tareSac));
  const apresTare = arrondi(Math.max(0, brut - tare));

  const h = pos(humidite), hn = pos(humiditeNorme);
  const excesHumidite = h > hn && hn < 100 ? h - hn : 0;
  const refactionHumidite = excesHumidite > 0
    ? arrondi(apresTare - apresTare * (100 - h) / (100 - hn))
    : 0;
  const apresHumidite = apresTare - refactionHumidite;

  const excesImpuretes = Math.max(0, pos(impuretes) - pos(impuretesNorme));
  const refactionImpuretes = arrondi(apresHumidite * excesImpuretes / 100);

  const net = arrondi(Math.max(0, apresHumidite - refactionImpuretes));
  const prixApplique = Math.max(0, Math.round(pos(prixKg) * (1 + (Number(ajustementGrade) || 0) / 100) + pos(primeKg)));
  const montant = Math.round(net * prixApplique);
  const tauxRefaction = apresTare > 0 ? arrondi((apresTare - net) / apresTare * 100, 1) : 0;

  return { brut, tare, apresTare, refactionHumidite, refactionImpuretes, net, prixApplique, montant, tauxRefaction, excesHumidite: arrondi(excesHumidite, 1) };
};

// ==========================================
// LECTURE DE LA BALANCE (port série / USB)
// ==========================================
// Les indicateurs de pesage envoient des trames texte du type
//   "ST,GS,+  0012.35kg"  (stable)   "US,GS,+  0012.10kg"  (instable)
//   "   25.40 kg"  ou  "W:25.4"  ou  "+000253 lb"
// On extrait le nombre, l'unité (convertie en kg) et le drapeau de stabilité.
export const lireTrame = (trame) => {
  if (typeof trame !== "string") return null;
  const t = trame.trim();
  if (!t) return null;
  const m = t.match(/([+-]?)\s*(\d+(?:[.,]\d+)?)\s*(kg|g|lb|t)?\b/i);
  if (!m) return null;
  let valeur = parseFloat(m[2].replace(",", "."));
  if (m[1] === "-") valeur = -valeur;
  const unite = (m[3] || "kg").toLowerCase();
  if (unite === "g") valeur /= 1000;
  else if (unite === "lb") valeur *= 0.45359237;
  else if (unite === "t") valeur *= 1000;
  const entete = t.toUpperCase();
  const stable = entete.startsWith("US") || entete.includes("MOTION") ? false
    : entete.startsWith("ST") ? true : null; // null = la balance ne le dit pas
  return { kg: arrondi(valeur, 3), stable };
};

// Détecte un poids stabilisé : les N dernières lectures restent dans la
// tolérance (kg). Évite de valider un sac encore en mouvement sur le plateau.
export const poidsStable = (lectures, { n = 5, tolerance = 0.05, minimum = 0.5 } = {}) => {
  if (!Array.isArray(lectures) || lectures.length < n) return null;
  const derniers = lectures.slice(-n);
  const min = Math.min(...derniers), max = Math.max(...derniers);
  if (max - min > tolerance) return null;
  const moyenne = derniers.reduce((s, x) => s + x, 0) / n;
  return moyenne >= minimum ? arrondi(moyenne) : null;
};

// Contrôles anti-fraude / erreurs de saisie avant validation.
export const alertesPesee = ({ calc, nbSacs = 0, humidite = 0, humiditeNorme = 0, saisieManuelle = false, pesees = [] }) => {
  const a = [];
  if (saisieManuelle) a.push("Poids saisi à la main (non lu sur la balance).");
  if (nbSacs > 0 && calc.apresTare > 0) {
    const moyen = calc.apresTare / nbSacs;
    if (moyen > 100) a.push(`Poids moyen de ${arrondi(moyen, 1)} kg par sac : vérifie le nombre de sacs.`);
    if (moyen < 20) a.push(`Poids moyen de ${arrondi(moyen, 1)} kg par sac : sacs très légers.`);
  }
  if (humidite > 0 && humiditeNorme > 0 && humidite - humiditeNorme > 5) a.push(`Humidité très élevée (${humidite} %) : produit à faire sécher avant achat ?`);
  const doublons = pesees.filter((p, i) => i > 0 && p === pesees[i - 1]).length;
  if (doublons > 0) a.push("Deux pesées identiques à la suite : sac pesé deux fois ?");
  return a;
};

// Cumul des achats par producteur depuis l'historique (tickets de pesée)
export const cumulProducteur = (historique = [], producteur = "") => {
  const cle = producteur.trim().toLowerCase();
  if (!cle) return { tickets: 0, kg: 0, montant: 0 };
  return historique
    .filter(h => h.details_facture?.type === "Pesée" && (h.details_facture.producteur || "").trim().toLowerCase() === cle)
    .reduce((s, h) => ({
      tickets: s.tickets + 1,
      kg: arrondi(s.kg + (h.details_facture.net || 0)),
      montant: s.montant + (h.details_facture.montant || 0),
    }), { tickets: 0, kg: 0, montant: 0 });
};

// Ticket de pesée lisible dans WhatsApp / imprimable
export const texteTicket = ({ numero, boutique, culture, producteur, calc, grade, humidite, impuretes, nbSacs, date, heure, fmt, paye }) => [
  `*${(boutique?.nom || "GOLLAM").toUpperCase()}*`,
  `⚖️ Ticket de pesée N° ${numero}`,
  `📅 ${date} à ${heure}`,
  `━━━━━━━━━━━━━━━`,
  `👨‍🌾 Producteur : ${producteur || "—"}`,
  `${culture.emoji} ${culture.nom}${grade ? ` · ${grade}` : ""}`,
  `Poids brut : ${calc.brut} kg (${nbSacs} sac${nbSacs > 1 ? "s" : ""})`,
  `Tare sacs : −${calc.tare} kg`,
  ...(calc.refactionHumidite > 0 ? [`Humidité ${humidite} % : −${calc.refactionHumidite} kg`] : []),
  ...(calc.refactionImpuretes > 0 ? [`Impuretés ${impuretes} % : −${calc.refactionImpuretes} kg`] : []),
  `*Poids net : ${calc.net} kg*`,
  `Prix : ${fmt(calc.prixApplique)} / kg`,
  `━━━━━━━━━━━━━━━`,
  `💰 Montant : *${fmt(calc.montant)}*`,
  paye ? "✅ PAYÉ" : "⏳ À PAYER",
].join("\n");
