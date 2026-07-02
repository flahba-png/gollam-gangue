// ============================================================
// CONFIGURATION BUSINESS — À PERSONNALISER
// ============================================================

// Ton email (propriétaire de la plateforme) : donne accès au panneau Admin.
// Lu depuis l'environnement (.env -> VITE_ADMIN_EMAIL) ; repli sur la valeur par
// défaut pour le dev local. NB : ce n'est PAS un secret — la vraie protection de
// l'Admin est la policy RLS "abonnement_admin" côté Supabase.
export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "flahba@icloud.com").toLowerCase();

// Numéro WhatsApp (format international, sans +) où les commerçants te contactent pour payer
export const ADMIN_WHATSAPP = "2250769691415";

// Numéros Mobile Money où recevoir les paiements (affichés sur le paywall)
export const PAIEMENT_INFOS = {
  wave: "07 69 69 14 15",
  orange: "07 69 69 14 15",
};

// Tarif de l'abonnement
export const PRIX_ABONNEMENT = 18000; // FCFA / mois
export const PRIX_ABONNEMENT_ANNUEL = 180000; // FCFA / an (2 mois offerts vs 12 x mensuel)
export const DUREE_ESSAI_JOURS = 14;
