// Traduit une erreur technique (Supabase/réseau) en message clair pour l'utilisateur.
// Évite d'afficher des messages anglais bruts du type "Could not find the table ... schema cache".
export const msgErreur = (e, contexte = "") => {
  const m = (e?.message || String(e || "")).toLowerCase();
  if (m.includes("schema cache") || m.includes("does not exist") || m.includes("find the table") || m.includes("could not find the") || m.includes("undefined column"))
    return "⚠️ Mise à jour de la base requise. Réessaie après la mise à jour, ou contacte le support.";
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network") || m.includes("fetch"))
    return "📡 Connexion indisponible. L'action se fera au retour du réseau.";
  if (m.includes("duplicate") || m.includes("unique"))
    return "Cet élément existe déjà.";
  if (m.includes("row-level security") || m.includes("policy") || m.includes("permission") || m.includes("not authorized"))
    return "Action non autorisée pour ce compte.";
  return contexte ? `❌ ${contexte} a échoué. Réessaie.` : "❌ Une erreur est survenue. Réessaie.";
};
