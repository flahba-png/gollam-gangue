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
  // --- Authentification ---
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "Email ou mot de passe incorrect.";
  if (m.includes("already registered") || m.includes("already exists") || m.includes("user already"))
    return "Un compte existe déjà avec cet email.";
  if (m.includes("password should be") || m.includes("password is too") || (m.includes("password") && m.includes("characters")))
    return "Mot de passe trop court (6 caractères minimum).";
  if (m.includes("email not confirmed"))
    return "Email pas encore confirmé. Vérifie ta boîte mail (et les spams).";
  if (m.includes("invalid email") || m.includes("invalid format") || m.includes("unable to validate email"))
    return "Adresse email invalide.";
  if (m.includes("for security purposes") || m.includes("rate limit") || m.includes("too many"))
    return "Trop de tentatives. Patiente un instant avant de réessayer.";
  return contexte ? `❌ ${contexte} a échoué. Réessaie.` : "❌ Une erreur est survenue. Réessaie.";
};
