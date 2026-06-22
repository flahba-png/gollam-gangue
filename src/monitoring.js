import { supabase } from "./supabase";

// Monitoring léger et autonome : enregistre les erreurs du terrain dans la
// table `erreurs` (consultable par l'admin dans Supabase). Best-effort : ne
// casse jamais l'app, anti-spam basique.
let dernierEnvoi = 0;

export async function logErreur(message, stack) {
  try {
    const now = Date.now();
    if (now - dernierEnvoi < 3000) return; // évite de spammer
    dernierEnvoi = now;
    let email = null;
    try { const { data } = await supabase.auth.getSession(); email = data?.session?.user?.email || null; } catch { /* ignore */ }
    await supabase.from("erreurs").insert({
      message: String(message || "").slice(0, 500),
      stack: String(stack || "").slice(0, 2000),
      url: typeof location !== "undefined" ? location.href : "",
      user_email: email,
    });
  } catch { /* monitoring ne doit jamais planter l'app */ }
}

export function installerMonitoring() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => logErreur(e?.message, e?.error?.stack));
  window.addEventListener("unhandledrejection", (e) => logErreur("Promesse rejetée : " + (e?.reason?.message || e?.reason), e?.reason?.stack));
}
