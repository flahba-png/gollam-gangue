import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { supabase } from "./supabase";
import { C, fmt, today, todayISO, heure, envoyerWhatsApp, appliquerTheme, themeActuel, DEVISE, appliquerDevise } from "./theme";
import { t, setLangue, langueActuelle } from "./i18n";
import { permsDe } from "./permissions";
// Eager : écrans du démarrage / fréquents
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import Stock from "./components/Stock";
import Credits from "./components/Credits";
import SaisieForm from "./components/SaisieForm";
import Compte from "./components/Compte";
import Paywall from "./components/Paywall";
import Onboarding, { onboardingVu } from "./components/Onboarding";
import PremiereBoutique from "./components/PremiereBoutique";
// Lazy : onglets secondaires (chargés à la demande → bundle initial plus léger)
const Historique = lazy(() => import("./components/Historique"));
const Stats = lazy(() => import("./components/Stats"));
const Transferts = lazy(() => import("./components/Transferts"));
const Equipe = lazy(() => import("./components/Equipe"));
const Fournisseurs = lazy(() => import("./components/Fournisseurs"));
const DettesFournisseurs = lazy(() => import("./components/DettesFournisseurs"));
const Cloture = lazy(() => import("./components/Cloture"));
const Inventaire = lazy(() => import("./components/Inventaire"));
const Admin = lazy(() => import("./components/Admin"));
const RechercheGlobale = lazy(() => import("./components/RechercheGlobale"));
const Surveillance = lazy(() => import("./components/Surveillance"));
const Messages = lazy(() => import("./components/Messages"));
const Journal = lazy(() => import("./components/Journal"));
const Documents = lazy(() => import("./components/Documents"));
const BonsCommande = lazy(() => import("./components/BonsCommande"));
const Promotions = lazy(() => import("./components/Promotions"));
import { bipVente, bipErreur } from "./feedback";
import { ADMIN_EMAIL, DUREE_ESSAI_JOURS, ADMIN_WHATSAPP, PRIX_ABONNEMENT } from "./config";
import { imprimerFacture, envoyerRecuWhatsApp } from "./receipt";
import { lireOutbox, ajouterOutbox, retirerOutbox, tailleOutbox } from "./outbox";
import { sauverCache, lireCache, ageCache } from "./cache";
import { msgErreur } from "./erreurs";
import { synchroniserFilets, tailleFilet } from "./fallback";
import { ecrireOperation } from "./operations";

export default function App() {
  const [session, setSession] = useState(null);
  const [boutiques, setBoutiques] = useState([]);
  const [mesMembres, setMesMembres] = useState([]); // boutiques où je suis employé
  const [boutiqueActive, setBoutiqueActive] = useState(null);
  const [vueGlobale, setVueGlobale] = useState(false);
  const [monRole, setMonRole] = useState("proprietaire"); // proprietaire | gerant | vendeur
  const [monNom, setMonNom] = useState("Patron");
  const [estProprio, setEstProprio] = useState(false);   // possède au moins 1 boutique
  const [boutiquesChargees, setBoutiquesChargees] = useState(false); // évite l'écran vide au démarrage
  const [rechargerBoutiques, setRechargerBoutiques] = useState(0);   // relance la recherche de boutiques
  const [abonnement, setAbonnement] = useState(null);
  const [produits, setProduits] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [credits, setCredits] = useState([]);
  const [transferts, setTransferts] = useState([]);
  const [fournisseurs, setFournisseurs] = useState([]);
  const [onglet, setOnglet] = useState("dashboard");
  const [menuPlus, setMenuPlus] = useState(false);
  const [statut, setStatut] = useState("");
  const [chargement, setChargement] = useState(false);
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [enAttente, setEnAttente] = useState(tailleOutbox());
  const [enAttenteFilet, setEnAttenteFilet] = useState(0); // clients/promos/bons gardés en local
  // Grand écran (ordinateur) : mise en page « application de bureau »
  const [estBureau, setEstBureau] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const maj = (e) => setEstBureau(e.matches);
    mq.addEventListener ? mq.addEventListener("change", maj) : mq.addListener(maj);
    return () => { mq.removeEventListener ? mq.removeEventListener("change", maj) : mq.removeListener(maj); };
  }, []);
  const [recovery, setRecovery] = useState(false); // l'utilisateur a cliqué un lien de réinitialisation
  const [nouveauMdp, setNouveauMdp] = useState("");
  const [voirMdp, setVoirMdp] = useState(false);
  const [compteOuvert, setCompteOuvert] = useState(false);
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  const [surveillanceOuverte, setSurveillanceOuverte] = useState(false);
  const [docPrefill, setDocPrefill] = useState(null);
  const [clientsManuels, setClientsManuels] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [dernierBackup, setDernierBackup] = useState(() => { try { return parseInt(localStorage.getItem("gollam_last_backup")) || 0; } catch { return 0; } });
  const [rappelBackupMasque, setRappelBackupMasque] = useState(false);
  const [montrerOnboarding, setMontrerOnboarding] = useState(!onboardingVu());
  const [theme, setTheme] = useState(themeActuel());
  const [langue, setLangueState] = useState(langueActuelle());

  const changerTheme = (nom) => { appliquerTheme(nom); setTheme(nom); };
  const changerLangue = (l) => { setLangue(l); setLangueState(l); };

  // Sauvegarde : exporte toutes les données du propriétaire en JSON
  const exporterDonnees = async () => {
    const ids = boutiques.map(b => b.id);
    if (ids.length === 0) { setStatut("⚠️ Aucune donnée à exporter."); return; }
    setStatut("⏳ Préparation de la sauvegarde...");
    const [{ data: prods }, { data: histo }, { data: creds }, { data: docs }] = await Promise.all([
      supabase.from("produits").select("*").in("boutique_id", ids),
      supabase.from("historique").select("*").in("boutique_id", ids),
      supabase.from("credits").select("*").in("boutique_id", ids),
      supabase.from("documents").select("*").in("boutique_id", ids),
    ]);
    const sauvegarde = {
      exporte_le: new Date().toISOString(),
      compte: session.user.email,
      boutiques, produits: prods || [], historique: histo || [], credits: creds || [], documents: docs || [],
    };
    const blob = new Blob([JSON.stringify(sauvegarde, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `gollam_sauvegarde_${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
    try { localStorage.setItem("gollam_last_backup", String(Date.now())); } catch { /* ignore */ }
    setDernierBackup(Date.now());
    setStatut("✅ Sauvegarde téléchargée.");
  };

  // Restauration : fusionne une sauvegarde JSON SANS créer de doublons.
  // - boutiques manquantes recréées (rattachées au compte courant)
  // - lignes ré-insérées seulement si absentes (signature unique)
  const restaurerSauvegarde = async (fichier) => {
    let data;
    try {
      data = JSON.parse(await fichier.text());
    } catch { setStatut("❌ Fichier illisible (JSON invalide)."); return; }
    if (!data || !Array.isArray(data.boutiques) || !Array.isArray(data.produits)) {
      setStatut("❌ Ce n'est pas une sauvegarde Gollam valide."); return;
    }
    setStatut("⏳ Restauration en cours...");
    const norm = (s) => String(s || "").trim().toLowerCase();
    try {
      // 1. Boutiques : on réutilise celle du même nom, sinon on la recrée (rattachée à moi)
      const locales = [...boutiques];
      const map = {}; // ancien id -> id cible
      for (const b of data.boutiques) {
        let cible = locales.find(x => norm(x.nom) === norm(b.nom));
        if (!cible) {
          const { id, proprietaire_id, parent_id, created_at, ...reste } = b; // eslint-disable-line no-unused-vars
          const { data: cree, error } = await supabase.from("boutiques")
            .insert({ ...reste, proprietaire_id: session.user.id }).select().single();
          if (error) throw error;
          cible = cree; locales.push(cree);
        }
        map[b.id] = cible.id;
      }
      // 2ᵉ passe : recâble les parent_id (entrepôts) sur les nouveaux ids
      for (const b of data.boutiques) {
        if (b.parent_id && map[b.parent_id] && map[b.id]) {
          await supabase.from("boutiques").update({ parent_id: map[b.parent_id] }).eq("id", map[b.id]);
        }
      }

      const cibleIds = [...new Set(Object.values(map))];
      // 2. Charge l'existant pour dédoublonner
      const [{ data: pEx }, { data: hEx }, { data: cEx }, { data: dEx }] = await Promise.all([
        supabase.from("produits").select("nom, boutique_id").in("boutique_id", cibleIds),
        supabase.from("historique").select("date_iso, heure, texte, montant, boutique_id").in("boutique_id", cibleIds),
        supabase.from("credits").select("client, article, total, boutique_id").in("boutique_id", cibleIds),
        supabase.from("documents").select("numero, boutique_id").in("boutique_id", cibleIds),
      ]);
      const sigP = new Set((pEx || []).map(r => `${r.boutique_id}|${norm(r.nom)}`));
      const sigH = new Set((hEx || []).map(r => `${r.boutique_id}|${r.date_iso}|${r.heure}|${r.texte}|${r.montant}`));
      const sigC = new Set((cEx || []).map(r => `${r.boutique_id}|${norm(r.client)}|${norm(r.article)}|${r.total}`));
      const sigD = new Set((dEx || []).map(r => `${r.boutique_id}|${r.numero}`));

      // 3. Prépare les insertions (sans id, boutique_id recâblé, hors doublons)
      const sansId = (row) => { const { id, created_at, ...reste } = row; return reste; }; // eslint-disable-line no-unused-vars
      const aImporter = { produits: [], historique: [], credits: [], documents: [] };

      for (const p of (data.produits || [])) {
        const bid = map[p.boutique_id]; if (!bid) continue;
        if (sigP.has(`${bid}|${norm(p.nom)}`)) continue;
        aImporter.produits.push({ ...sansId(p), boutique_id: bid });
      }
      for (const h of (data.historique || [])) {
        const bid = map[h.boutique_id]; if (!bid) continue;
        if (sigH.has(`${bid}|${h.date_iso}|${h.heure}|${h.texte}|${h.montant}`)) continue;
        aImporter.historique.push({ ...sansId(h), boutique_id: bid });
      }
      for (const c of (data.credits || [])) {
        const bid = map[c.boutique_id]; if (!bid) continue;
        if (sigC.has(`${bid}|${norm(c.client)}|${norm(c.article)}|${c.total}`)) continue;
        aImporter.credits.push({ ...sansId(c), boutique_id: bid });
      }
      for (const d of (data.documents || [])) {
        const bid = map[d.boutique_id]; if (!bid) continue;
        if (sigD.has(`${bid}|${d.numero}`)) continue;
        aImporter.documents.push({ ...sansId(d), boutique_id: bid });
      }

      // 4. Insertion par lots
      let total = 0;
      for (const [table, lignes] of Object.entries(aImporter)) {
        for (let i = 0; i < lignes.length; i += 200) {
          const lot = lignes.slice(i, i + 200);
          const { error } = await supabase.from(table).insert(lot);
          if (error) throw error;
          total += lot.length;
        }
      }

      setBoutiques(locales);
      await chargerDonnees();
      setStatut(`✅ Restauration terminée : ${total} élément(s) réintégré(s) (doublons ignorés).`);
    } catch (e) {
      setStatut(msgErreur(e, "La restauration"));
    }
  };

  // Demande d'abonnement par WhatsApp (depuis le bandeau de rappel)
  const demanderAbonnement = () => {
    envoyerWhatsApp(ADMIN_WHATSAPP,
      `Bonjour 👋\nJe veux m'abonner à Gollam Platform (${fmt(PRIX_ABONNEMENT)}/mois).\nEmail : ${session?.user?.email || ""}`);
  };
  const [kpi, setKpi] = useState({ ca: 0, depenses: 0, benefice: 0, dettes: 0, margeTotal: 0 });

  // Détection de la connexion réseau
  useEffect(() => {
    const online = () => setEnLigne(true);
    const offline = () => setEnLigne(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  // Le toast de statut disparaît tout seul
  useEffect(() => {
    if (!statut) return;
    const t = setTimeout(() => setStatut(""), 3800);
    return () => clearTimeout(t);
  }, [statut]);

  // Boutique utilisée pour l'affichage (titres, reçus)
  const boutique = vueGlobale ? { nom: "Toutes les boutiques", ville: `${boutiques.length} boutique(s)` } : boutiqueActive;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const definirNouveauMdp = async () => {
    if ((nouveauMdp || "").length < 6) { setStatut("⚠️ Mot de passe trop court (min 6)."); return; }
    const { error } = await supabase.auth.updateUser({ password: nouveauMdp });
    if (error) { setStatut(msgErreur(error)); return; }
    setRecovery(false); setNouveauMdp("");
    setStatut("✅ Mot de passe modifié. Tu es connecté.");
  };

  // Charger mes boutiques : celles que je possède + celles où je suis employé
  useEffect(() => {
    if (!session) return;
    (async () => {
     try {
      // 1. Réclamer les invitations en attente (lier mon compte par email)
      await supabase.from("membres").update({ user_id: session.user.id })
        .is("user_id", null).ilike("email", session.user.email);

      // 2. Mes adhésions (en tant qu'employé)
      const { data: membres } = await supabase.from("membres").select("*").eq("user_id", session.user.id);
      setMesMembres(membres || []);

      // 3. Boutiques possédées
      const { data: possedees } = await supabase.from("boutiques").select("*").eq("proprietaire_id", session.user.id).order("created_at");

      // 4. Boutiques où je suis employé
      let membreBoutiques = [];
      const ids = (membres || []).map(m => m.boutique_id);
      if (ids.length) {
        const { data } = await supabase.from("boutiques").select("*").in("id", ids);
        membreBoutiques = data || [];
      }

      const toutes = [...(possedees || []), ...membreBoutiques.filter(b => !(possedees || []).some(p => p.id === b.id))];
      setBoutiques(toutes);
      setBoutiqueActive(prev => prev || toutes[0] || null);
      sauverCache(`meta_${session.user.id}`, { boutiques: toutes, membres: membres || [] });

      // Propriétaire = possède au moins une boutique → soumis à l'abonnement
      const proprio = (possedees || []).length > 0;
      setEstProprio(proprio);
      if (proprio) {
        let { data: abo } = await supabase.from("abonnements").select("*").eq("proprietaire_id", session.user.id).maybeSingle();
        if (!abo) {
          const fin = new Date(); fin.setDate(fin.getDate() + DUREE_ESSAI_JOURS);
          const { data: nouv } = await supabase.from("abonnements")
            .insert({ proprietaire_id: session.user.id, email: session.user.email, nom: (possedees[0] || {}).nom || "", plan: "essai", date_fin: fin.toISOString() })
            .select().single();
          abo = nouv;
        }
        setAbonnement(abo);
      }
     } catch {
      // Démarrage hors-ligne : on restaure les boutiques du dernier instantané
      const c = lireCache(`meta_${session.user.id}`);
      if (c?.boutiques?.length) {
        setMesMembres(c.membres || []);
        setBoutiques(c.boutiques);
        setBoutiqueActive(prev => prev || c.boutiques[0] || null);
        setEstProprio(c.boutiques.some(b => b.proprietaire_id === session.user.id));
      }
     } finally {
      setBoutiquesChargees(true);
     }
    })();
  }, [session, rechargerBoutiques]);

  // Déterminer mon rôle et mon nom sur la boutique active
  useEffect(() => {
    if (!session || !boutiqueActive) { setMonRole("proprietaire"); setMonNom("Patron"); return; }
    if (boutiqueActive.proprietaire_id === session.user.id) { setMonRole("proprietaire"); setMonNom("Patron"); return; }
    const m = mesMembres.find(x => x.boutique_id === boutiqueActive.id);
    setMonRole(m?.role || "vendeur");
    setMonNom(m?.nom || session.user.email?.split("@")[0] || "Vendeur");
  }, [session, boutiqueActive, mesMembres]);

  const chargerDonnees = useCallback(async () => {
    if (!session) return;

    // Vue globale = toutes les boutiques du propriétaire ; sinon la boutique active
    const ids = vueGlobale ? boutiques.map(b => b.id) : (boutiqueActive ? [boutiqueActive.id] : []);
    if (ids.length === 0) { setProduits([]); setHistorique([]); setCredits([]); setKpi({ ca: 0, depenses: 0, benefice: 0, dettes: 0, margeTotal: 0 }); return; }

    const scope = vueGlobale ? `g_${session.user.id}` : `b_${boutiqueActive.id}`;
    const calcKpi = (histo, creds) => {
      let ca = 0, dep = 0, marge = 0, dettes = 0;
      (histo || []).forEach(h => {
        if (h.type === "vente") { ca += h.montant || 0; marge += h.benefice_etabli || 0; }
        if (h.type === "retour") { ca -= h.montant || 0; marge += h.benefice_etabli || 0; }
        if (h.type === "depense") dep += h.montant || 0;
      });
      (creds || []).forEach(c => dettes += c.reste_a_payer || 0);
      return { ca, depenses: dep, benefice: marge - dep, dettes, margeTotal: marge };
    };

    try {
      const [{ data: prods }, { data: histo }, { data: creds }, { data: transf }] = await Promise.all([
        supabase.from("produits").select("*").in("boutique_id", ids).order("nom"),
        supabase.from("historique").select("*").in("boutique_id", ids).order("created_at", { ascending: false }),
        supabase.from("credits").select("*").in("boutique_id", ids),
        supabase.from("transferts").select("*").eq("proprietaire_id", session.user.id).order("created_at", { ascending: false }),
      ]);

      let fourn = [];
      if (!vueGlobale && boutiqueActive) {
        const r = await supabase.from("fournisseurs").select("*").eq("boutique_id", boutiqueActive.id).order("nom");
        fourn = r.data || [];
      }

      setProduits(prods || []);
      setHistorique(histo || []);
      setCredits(creds || []);
      setTransferts(transf || []);
      setFournisseurs(fourn);
      setKpi(calcKpi(histo, creds));

      // Instantané pour consultation hors-ligne
      sauverCache(scope, { produits: prods || [], historique: histo || [], credits: creds || [], transferts: transf || [], fournisseurs: fourn });
    } catch {
      // Hors-ligne (ou erreur réseau) : on affiche le dernier instantané connu
      const c = lireCache(scope);
      if (c) {
        setProduits(c.produits || []);
        setHistorique(c.historique || []);
        setCredits(c.credits || []);
        setTransferts(c.transferts || []);
        setFournisseurs(c.fournisseurs || []);
        setKpi(calcKpi(c.historique, c.credits));
        setStatut(`📴 Hors-ligne — données ${ageCache(c._ts)}.`);
      } else {
        setStatut("📴 Hors-ligne — aucune donnée en cache pour cette boutique.");
      }
    }
  }, [session, boutiqueActive, vueGlobale, boutiques]);

  useEffect(() => { chargerDonnees(); }, [chargerDonnees]);

  // Carnet de clients (ajoutés manuellement) de la boutique active
  useEffect(() => {
    if (!boutiqueActive || vueGlobale) { setClientsManuels([]); return; }
    supabase.from("clients").select("*").eq("boutique_id", boutiqueActive.id)
      .then(({ data }) => setClientsManuels(data || [])).catch(() => {});
  }, [boutiqueActive, vueGlobale]);

  // Promotions de la boutique active (pour appliquer le prix remisé en vente)
  const chargerPromos = useCallback(() => {
    if (!boutiqueActive || vueGlobale) { setPromotions([]); return; }
    supabase.from("promotions").select("*").eq("boutique_id", boutiqueActive.id)
      .then(({ data }) => setPromotions(data || [])).catch(() => {});
  }, [boutiqueActive, vueGlobale]);
  useEffect(() => { chargerPromos(); }, [chargerPromos]);

  // Total dû aux fournisseurs (position nette au Dashboard)
  const [dettesFournisseurs, setDettesFournisseurs] = useState(0);
  useEffect(() => {
    if (!boutiqueActive || vueGlobale) { setDettesFournisseurs(0); return; }
    supabase.from("dettes_fournisseurs").select("reste_a_payer").eq("boutique_id", boutiqueActive.id).gt("reste_a_payer", 0)
      .then(({ data }) => setDettesFournisseurs((data || []).reduce((s, d) => s + (d.reste_a_payer || 0), 0)))
      .catch(() => setDettesFournisseurs(0));
  }, [boutiqueActive, vueGlobale, onglet]);

  // Map produit(lower) -> % de remise (promo active la plus avantageuse)
  const promosActives = useMemo(() => {
    const t = todayISO();
    const map = {};
    promotions.forEach(p => {
      if ((p.date_debut && p.date_debut > t) || (p.date_fin && p.date_fin < t)) return; // pas active
      (p.produits || []).forEach(nom => {
        const k = (nom || "").trim().toLowerCase();
        if (!k) return;
        map[k] = Math.max(map[k] || 0, p.pourcentage || 0);
      });
    });
    return map;
  }, [promotions]);

  // Personnes déjà bénéficiaires d'une dépense (saisie plus rapide la fois d'après)
  const beneficiairesConnus = useMemo(() => {
    const set = new Set();
    historique.forEach(h => { const b = h.details_facture?.beneficiaire; if (b) set.add(b); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [historique]);

  // Liste unifiée des clients connus (crédits + ventes nominatives + carnet)
  const clientsConnus = useMemo(() => {
    const map = new Map();
    const add = (nom, phone) => {
      if (!nom || nom === "Client Comptoir") return;
      const k = nom.trim().toLowerCase();
      if (!map.has(k)) map.set(k, { nom: nom.trim(), phone: phone || "" });
      else if (phone && !map.get(k).phone) map.get(k).phone = phone;
    };
    credits.forEach(c => add(c.client, c.client_phone));
    historique.forEach(h => add(h.details_facture?.client, h.details_facture?.clientPhone));
    clientsManuels.forEach(c => add(c.nom, c.phone));
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [credits, historique, clientsManuels]);

  // Au retour de la connexion, on resynchronise les données
  useEffect(() => { if (enLigne) chargerDonnees(); }, [enLigne, chargerDonnees]);

  // Logique d'enregistrement partagée (formulaire + saisie texte IA)
  // Retourne true si succès, false si erreur (statut déjà positionné)
  // Écrivain serveur PUR : lit le stock depuis Supabase, écrit l'opération.
  // Utilisé à la fois pour l'écriture immédiate (en ligne) et pour rejouer la file.
  // Retourne { ok, err }.
  // ecrireOperation (vente/crédit/stock/dépense) vit dans src/operations.js (testable, hors React)

  // Retour / avoir : réintègre le stock et enregistre un avoir négatif
  const effectuerRetour = async (venteLog, lignesRetour) => {
    if (!boutiqueActive) return;
    const uid = boutiqueActive.id;
    const lignesOrig = venteLog.details_facture?.lignes || [];
    const totalOrigBrut = lignesOrig.reduce((s, l) => s + (l.total || 0), 0) || 1;
    const remiseOrig = venteLog.details_facture?.remise || 0;

    let refundBrut = 0, margeRendue = 0;
    for (const l of lignesRetour) {
      if (!l.qte) continue;
      const { data: prod } = await supabase.from("produits").select("*").eq("boutique_id", uid).ilike("nom", l.nom).maybeSingle();
      if (prod) await supabase.from("produits").update({ stock: (prod.stock || 0) + l.qte }).eq("id", prod.id);
      else await supabase.from("produits").insert({ boutique_id: uid, nom: l.nom, prix_achat: 0, prix_vente: l.pu || 0, stock: l.qte });
      refundBrut += (l.pu || 0) * l.qte;
      margeRendue += ((l.pu || 0) - ((prod?.prix_achat || 0) + (prod?.frais_unitaire || 0))) * l.qte;
    }
    if (refundBrut === 0) { setStatut("⚠️ Rien à retourner."); return; }

    // Remise répartie au prorata
    const remiseProp = Math.round(remiseOrig * (refundBrut / totalOrigBrut));
    const refund = refundBrut - remiseProp;
    const marge = margeRendue - remiseProp;
    const resume = lignesRetour.filter(l => l.qte).map(l => `${l.qte}x ${l.nom}`).join(", ");

    // Vente d'origine à crédit : le retour réduit D'ABORD la dette du client
    // (plus anciennes fiches en premier). Seul le surplus éventuel — si la dette
    // était déjà remboursée — est rendu en espèces et sort de la caisse.
    let refundCaisse = refund;
    let detteReduite = 0;
    const clientOrig = venteLog.details_facture?.client;
    if (venteLog.details_facture?.type === "Vente à Crédit" && clientOrig) {
      const { data: fiches } = await supabase.from("credits").select("*").eq("boutique_id", uid).ilike("client", clientOrig);
      const ouvertes = (fiches || []).filter(f => (f.reste_a_payer || 0) > 0)
        .sort((a, b) => new Date(a.created_at || a.date || 0) - new Date(b.created_at || b.date || 0));
      let aDeduire = refund;
      for (const f of ouvertes) {
        if (aDeduire <= 0) break;
        const d = Math.min(aDeduire, f.reste_a_payer);
        const nouveau = f.reste_a_payer - d;
        // Retour = la vente rétrécit : on réduit aussi le total de la fiche,
        // pour que la barre « Remboursé % » (avance/total) reste juste.
        if (nouveau === 0) await supabase.from("credits").delete().eq("id", f.id);
        else await supabase.from("credits").update({ reste_a_payer: nouveau, total: Math.max(0, (f.total || 0) - d) }).eq("id", f.id);
        aDeduire -= d;
        detteReduite += d;
      }
      refundCaisse = aDeduire;
    }

    await supabase.from("historique").insert({
      boutique_id: uid, heure: heure(), date_iso: todayISO(),
      texte: `↩️ Retour ${resume}${detteReduite > 0 ? " (dette réduite)" : ""}`, type: "retour",
      montant: refundCaisse, benefice_etabli: -marge,
      mode_paiement: venteLog.mode_paiement || "especes", vendeur_nom: monNom,
      details_facture: { client: clientOrig || "Client", article: resume, lignes: lignesRetour.filter(l => l.qte), total: refund, dette_reduite: detteReduite, type: "Retour / Avoir" },
    });
    // Journal d'audit (action sensible : retour/avoir)
    try {
      await supabase.from("journal_audit").insert({
        boutique_id: uid, proprietaire_id: boutiqueActive.proprietaire_id || null, user_nom: monNom,
        action: "retour", details: { resume, refund, vente_origine: venteLog.id },
      });
    } catch { /* ignore si table absente */ }
    await chargerDonnees();
    const details = [
      detteReduite > 0 ? `dette du client -${fmt(detteReduite)}` : "",
      refundCaisse > 0 ? `-${fmt(refundCaisse)} remboursé en caisse` : "",
    ].filter(Boolean).join(", ");
    setStatut(`✅ Retour enregistré : ${details || `-${fmt(refund)}`}, stock réintégré.`);
  };

  // Trace cachée : enregistre une modification/suppression d'un mouvement
  const loggerModif = async ({ table, cibleId, action, ancien, nouveau }) => {
    if (!boutiqueActive) return;
    try {
      await supabase.from("logs_modifications").insert({
        boutique_id: boutiqueActive.id,
        proprietaire_id: boutiqueActive.proprietaire_id || null,
        table_cible: table, cible_id: String(cibleId), action,
        ancienne_valeur: ancien || null, nouvelle_valeur: nouveau || null,
        user_nom: monNom,
      });
    } catch { /* table absente : on n'empêche pas l'action métier */ }
  };

  // Suppression d'un mouvement d'historique avec réintégration du stock + audit
  const supprimerMouvement = async (h) => {
    // On agit toujours sur la boutique d'origine du mouvement (utile en vue globale)
    const uid = h.boutique_id || boutiqueActive?.id;
    if (!uid) return;

    // 1. Réintègre/retire le stock selon le type de mouvement
    try {
      if (h.type === "transfert") {
        // Une jambe de transfert : "sortie" a retiré le stock ici → on ré-ajoute ;
        // "entree" (réception ou retour de refus) a ajouté → on retire.
        const txt = h.texte || "";
        const refus = txt.includes("refusé"); // jambe de refus : fiche déjà "annule"
        let nom = "", qte = 0, sens = "";
        const d = h.details_facture;
        if (d?.produit_nom && d?.qte) {
          nom = d.produit_nom; qte = d.qte; sens = d.sens;
        } else {
          // Repli pour les anciens transferts sans données structurées
          const m = /(\d+)x\s+(.+?)\s*[→←(]/.exec(txt);
          if (m) { qte = parseInt(m[1]) || 0; nom = m[2].trim(); }
          sens = txt.includes("📤") ? "sortie" : "entree";
        }
        const effet = sens === "sortie" ? +1 : -1; // +1 = ré-ajoute, -1 = retire
        if (nom && qte) {
          const { data: p } = await supabase.from("produits").select("id, stock").eq("boutique_id", uid).ilike("nom", nom).maybeSingle();
          if (p) await supabase.from("produits").update({ stock: Math.max(0, (p.stock || 0) + effet * qte) }).eq("id", p.id);

          // Cohérence : on repasse la fiche transfert liée en "annulé"
          // (sauf jambe de refus, déjà annulée). On cible la plus récente qui colle.
          if (!refus) {
            const champLieu = sens === "sortie" ? "source_id" : "dest_id";
            const statutsActifs = sens === "sortie" ? ["en_attente", "recu"] : ["recu"];
            const { data: fiches } = await supabase.from("transferts")
              .select("id").eq(champLieu, uid).ilike("produit_nom", nom).eq("quantite", qte)
              .in("statut", statutsActifs).order("date_envoi", { ascending: false }).limit(1);
            if (fiches && fiches[0]) {
              await supabase.from("transferts").update({ statut: "annule" }).eq("id", fiches[0].id);
            }
          }
        }
      } else if (h.type === "vente") {
        // La vente avait décrémenté le stock → on le ré-ajoute
        for (const l of (h.details_facture?.lignes || [])) {
          const { data: p } = await supabase.from("produits").select("id, stock").eq("boutique_id", uid).ilike("nom", l.nom).maybeSingle();
          if (p) await supabase.from("produits").update({ stock: (p.stock || 0) + (l.qte || 0) }).eq("id", p.id);
        }
        // Si vente à crédit, on retire la créance liée (meilleur effort)
        if ((h.details_facture?.type || "").includes("Crédit") && h.details_facture?.client) {
          await supabase.from("credits").delete().eq("boutique_id", uid).ilike("client", h.details_facture.client).eq("article", h.details_facture.article || "");
        }
      } else if (h.type === "retour") {
        // Le retour avait ré-ajouté le stock → on le retire
        for (const l of (h.details_facture?.lignes || [])) {
          const { data: p } = await supabase.from("produits").select("id, stock").eq("boutique_id", uid).ilike("nom", l.nom).maybeSingle();
          if (p) await supabase.from("produits").update({ stock: Math.max(0, (p.stock || 0) - (l.qte || 0)) }).eq("id", p.id);
        }
      } else if (h.type === "ajout") {
        // L'ajout avait incrémenté le stock → on le retire (parse du texte "+Nx Nom")
        const m = /\+(\d+)x\s+(.+)$/.exec(h.texte || "");
        if (m) {
          const qte = parseInt(m[1]) || 0;
          const { data: p } = await supabase.from("produits").select("id, stock").eq("boutique_id", uid).ilike("nom", m[2].trim()).maybeSingle();
          if (p) await supabase.from("produits").update({ stock: Math.max(0, (p.stock || 0) - qte) }).eq("id", p.id);
        }
      }
    } catch { /* on continue : la suppression de la ligne reste prioritaire */ }

    // 2. Trace cachée AVANT suppression (on garde l'ancienne valeur complète)
    await loggerModif({ table: "historique", cibleId: h.id, action: "suppression", ancien: h });

    // 3. Supprime la ligne d'historique
    await supabase.from("historique").delete().eq("id", h.id);
    await chargerDonnees();
    setStatut("🗑️ Mouvement supprimé (stock réajusté, trace conservée).");
  };

  // Saisie via formulaire : en ligne → écrit ; hors-ligne → met en file d'attente
  const enregistrerForm = async (donnees) => {
    if (!boutiqueActive) { setStatut("⚠️ Sélectionne une boutique d'abord."); return; }

    if (!navigator.onLine) {
      const n = ajouterOutbox({ id: `op_${Date.now()}`, boutiqueId: boutiqueActive.id, donnees });
      setEnAttente(n);
      if (donnees.action === "vente") bipVente();
      setStatut(`📡 Hors-ligne — opération mise en file (${n}). Synchronisation auto au retour du réseau.`);
      return;
    }

    setChargement(true);
    setStatut("⏳ Enregistrement...");
    const { ok, err } = await ecrireOperation(donnees, boutiqueActive.id, monNom);
    if (ok) { await chargerDonnees(); if (donnees.action === "vente") bipVente(); setStatut("✅ Enregistré"); }
    else { bipErreur(); setStatut(`❌ ${err}`); }
    setChargement(false);
  };

  // Rejoue la file d'attente quand le réseau revient
  const flushOutbox = useCallback(async () => {
    if (!navigator.onLine) return;
    const items = lireOutbox();
    if (items.length === 0) return;

    setStatut(`🔄 Synchronisation de ${items.length} opération(s)...`);
    let echecs = 0;
    for (const it of items) {
      const { ok } = await ecrireOperation(it.donnees, it.boutiqueId, monNom);
      if (ok) retirerOutbox(it.id);
      else echecs++;
    }
    setEnAttente(tailleOutbox());
    // Remonte aussi en base les clients/promos/bons gardés en local (filet de sécurité)
    const restantsFilet = await synchroniserFilets(boutiqueActive?.id);
    setEnAttenteFilet(restantsFilet);
    await chargerDonnees();
    setStatut(echecs > 0 ? `⚠️ Synchro terminée, ${echecs} opération(s) en échec.` : "✅ Tout est synchronisé.");
  }, [chargerDonnees, boutiqueActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronise dès que le réseau revient (ou au démarrage si file non vide)
  useEffect(() => { if (enLigne) flushOutbox(); }, [enLigne, flushOutbox]);
  // Tient à jour le compteur d'éléments locaux à synchroniser
  useEffect(() => { setEnAttenteFilet(tailleFilet(boutiqueActive?.id)); }, [boutiqueActive]);

  const deconnecter = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setBoutiques([]);
    setBoutiqueActive(null);
    setVueGlobale(false);
    setAbonnement(null);
    setEstProprio(false);
  };

  if (!session) return <Auth />;

  // Écran de définition d'un nouveau mot de passe (après clic sur le lien email)
  if (recovery) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🔑</div>
            <div style={{ fontSize: 18, fontWeight: "bold", color: C.text }}>Nouveau mot de passe</div>
          </div>
          <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input type={voirMdp ? "text" : "password"} value={nouveauMdp} onChange={e => setNouveauMdp(e.target.value)}
                placeholder="Ton nouveau mot de passe"
                style={{ width: "100%", padding: "10px 44px 10px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, boxSizing: "border-box", outline: "none" }} />
              <button type="button" onClick={() => setVoirMdp(v => !v)}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", fontSize: 16 }}>
                {voirMdp ? "🙈" : "👁️"}
              </button>
            </div>
            {statut && <div style={{ fontSize: 12, textAlign: "center", marginBottom: 10, color: statut.startsWith("❌") || statut.startsWith("⚠️") ? C.red : C.green }}>{statut}</div>}
            <button onClick={definirNouveauMdp}
              style={{ width: "100%", padding: 12, background: C.green, color: C.bg, border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 14, cursor: "pointer" }}>
              Valider
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Abonnement : on bloque le propriétaire si son essai/abonnement est expiré.
  // Mais il reste libre de travailler dans les boutiques d'AUTRES patrons où il
  // est employé — c'est leur abonnement à eux qui compte, pas le sien.
  const boutiquesEmploye = boutiques.filter(b => b.proprietaire_id !== session.user.id);
  const surBoutiqueDunAutre = !vueGlobale && boutiqueActive && boutiqueActive.proprietaire_id !== session.user.id;
  const aboExpire = estProprio && abonnement && new Date(abonnement.date_fin) <= new Date() && !surBoutiqueDunAutre;
  if (aboExpire) {
    const statsPaywall = {
      boutiques: boutiques.length,
      produits: produits.length,
      ventes: historique.filter(h => h.type === "vente").length,
      ca: kpi.ca,
    };
    return <Paywall abonnement={abonnement} nomBoutique={boutiques[0]?.nom} email={session.user.email} stats={statsPaywall}
      boutiquesEmploye={boutiquesEmploye}
      onAllerBoutique={(b) => { setVueGlobale(false); setBoutiqueActive(b); setOnglet("saisie"); }}
      onDeconnexion={deconnecter} />;
  }

  // Aucune boutique : compte neuf, données supprimées, ou employé pas encore rattaché
  if (boutiquesChargees && boutiques.length === 0) {
    return <PremiereBoutique
      email={session.user.email}
      proprietaireId={session.user.id}
      onCreated={(b) => {
        // On relance le chargement : la boutique est prise en compte et
        // l'essai gratuit est créé au passage (comme à l'inscription).
        setBoutiqueActive(b);
        setBoutiquesChargees(false);
        setRechargerBoutiques(n => n + 1);
      }}
      onRafraichir={() => { setBoutiquesChargees(false); setRechargerBoutiques(n => n + 1); }}
      onLogout={deconnecter}
    />;
  }

  // Onboarding au tout premier lancement (propriétaire)
  if (estProprio && montrerOnboarding) {
    return <Onboarding onFini={() => setMontrerOnboarding(false)} />;
  }
  const joursRestants = abonnement ? Math.max(0, Math.ceil((new Date(abonnement.date_fin) - new Date()) / 86400000)) : null;
  const estAdmin = (session.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const estEntrepot = !vueGlobale && boutiqueActive?.type === "entrepot";
  const estPatron = monRole === "proprietaire" || monRole === "gerant";

  // Permissions effectives de l'utilisateur sur la boutique active
  const estOwner = !vueGlobale && boutiqueActive?.proprietaire_id === session.user.id;
  const monMembre = mesMembres.find(x => x.boutique_id === boutiqueActive?.id);
  const perms = permsDe({ estOwner: estOwner || vueGlobale, role: monRole, permissions: monMembre?.permissions });
  const peutVoirBenefice = perms.benefice_voir;
  const recepAttente = transferts.filter(t => t.dest_id === boutiqueActive?.id && t.statut === "en_attente").length;

  // Onglets selon le rôle : un vendeur a un accès restreint
  const tabsPatron = [
    { id: "dashboard", label: "🏠", title: t("accueil") },
    { id: "saisie", label: "➕", title: t("saisie") },
    { id: "transferts", label: "🔄", title: t("transferts"), badge: recepAttente },
    { id: "historique", label: "📊", title: t("historique") },
    { id: "stock", label: "📦", title: t("stock") },
    { id: "fournisseurs", label: "🚚", title: t("reassort"), badge: produits.filter(p => (p.stock || 0) <= (p.seuil_alerte ?? 2)).length },
    { id: "bons_commande", label: "📥", title: "Bons de commande" },
    { id: "dettes_fourn", label: "💸", title: "Dettes fournisseurs" },
    { id: "promotions", label: "🎉", title: "Promotions" },
    { id: "credits", label: "📒", title: t("credits"), badge: credits.length },
    { id: "documents", label: "🧾", title: t("documents") },
    { id: "chat", label: "💬", title: "Messages & Clients", badge: credits.length },
    { id: "equipe", label: "🧑‍🤝‍🧑", title: t("equipe") },
    { id: "caisse", label: "🔒", title: t("caisse") },
    { id: "inventaire", label: "📋", title: t("inventaire") },
    { id: "stats", label: "📈", title: t("stats") },
    { id: "journal", label: "🕵️", title: "Journal" },
    ...(estAdmin ? [{ id: "admin", label: "👑", title: t("admin") }] : []),
  ];
  // Onglets du vendeur filtrés selon ses permissions
  const tabsVendeur = [
    { id: "saisie", label: "➕", title: t("vendre") },
    { id: "historique", label: "📊", title: t("historique") },
    perms.stock_modifier && { id: "stock", label: "📦", title: t("stock") },
    perms.credit_accorder && { id: "credits", label: "📒", title: t("credits"), badge: credits.length },
    { id: "documents", label: "🧾", title: t("documents") },
    { id: "chat", label: "💬", title: t("chat") },
    perms.caisse_voir && { id: "caisse", label: "🔒", title: t("caisse") },
  ].filter(Boolean);
  const tabs = estPatron ? tabsPatron : tabsVendeur;

  // Barre du bas = 4 principaux + bouton "Plus" (le reste dans un menu)
  const idsPrimaires = estPatron ? ["dashboard", "saisie", "stock", "credits"] : ["saisie", ...(perms.stock_modifier ? ["stock"] : []), ...(perms.credit_accorder ? ["credits"] : []), ...(perms.caisse_voir ? ["caisse"] : [])].slice(0, 4);
  // Sur ordinateur : la barre du bas devient une barre latérale et TOUS les
  // onglets y tiennent (plus besoin du menu « ⋯ Plus »).
  const primaires = estBureau ? tabs : idsPrimaires.map(id => tabs.find(t => t.id === id)).filter(Boolean);
  const secondaires = estBureau ? [] : tabs.filter(t => !idsPrimaires.includes(t.id));

  // Rangement du menu de bureau par métier (inspiré des ERP : Acteurs, Stock…)
  const SECTIONS_NAV = [
    { titre: "Accueil", ids: ["dashboard", "saisie"] },
    { titre: "Ventes", ids: ["historique", "credits", "documents", "promotions"] },
    { titre: "Stock", ids: ["stock", "inventaire", "transferts"] },
    { titre: "Achats", ids: ["fournisseurs", "bons_commande", "dettes_fourn"] },
    { titre: "Acteurs", ids: ["chat", "equipe"] },
    { titre: "Finances", ids: ["caisse", "stats"] },
    { titre: "Contrôle", ids: ["journal", "admin"] },
  ];
  const groupesNav = (() => {
    const places = new Set();
    const groupes = SECTIONS_NAV.map(s => {
      const liste = s.ids.map(id => tabs.find(t => t.id === id)).filter(Boolean);
      liste.forEach(t => places.add(t.id));
      return { titre: s.titre, tabs: liste };
    }).filter(g => g.tabs.length > 0);
    const restants = tabs.filter(t => !places.has(t.id)); // filet : rien ne disparaît
    if (restants.length) groupes.push({ titre: "Autres", tabs: restants });
    return groupes;
  })();

  // Un onglet de la barre (identique en bas sur téléphone et à gauche sur ordinateur)
  const boutonOnglet = (tab) => {
    const actif = onglet === tab.id;
    return (
      <button key={tab.id} onClick={() => { setOnglet(tab.id); setMenuPlus(false); }} className={`nav-btn${actif ? " nav-btn-actif" : ""}`}
        style={{ flex: 1, padding: "7px 2px 6px", background: "transparent", border: "none", cursor: "pointer", position: "relative" }}>
        <div className="nav-ico" style={{ fontSize: 19, transform: actif ? "translateY(-1px) scale(1.12)" : "none", transition: "transform 0.2s cubic-bezier(0.22,1,0.36,1)", filter: actif ? "none" : "grayscale(0.3) opacity(0.85)" }}>{tab.label}</div>
        <div className="nav-txt" style={{ fontSize: 9, color: actif ? C.green : C.muted, marginTop: 2, fontWeight: actif ? "bold" : "normal" }}>{tab.title}</div>
        {tab.badge > 0 && (
          <div className="nav-badge" style={{ position: "absolute", top: 2, right: "50%", transform: "translateX(9px)", background: C.red, color: "#fff", fontSize: 8, minWidth: 14, height: 14, padding: "0 3px", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", animation: "popIn 0.2s ease" }}>{tab.badge}</div>
        )}
        {actif && <div className="nav-actif" style={{ position: "absolute", bottom: 0, left: "25%", right: "25%", height: 2.5, background: C.green, borderRadius: 2, boxShadow: `0 0 8px ${C.green}` }} />}
      </button>
    );
  };
  const badgeSecondaire = secondaires.some(t => t.badge > 0);

  // Si le vendeur est sur un onglet interdit, le ramener sur "saisie"
  if (!tabs.some(t => t.id === onglet)) {
    // évite une boucle : on ne reset que si nécessaire
    if (onglet !== "saisie") setTimeout(() => setOnglet("saisie"), 0);
  }

  return (
    <div className="app-shell" style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", maxWidth: 480, margin: "0 auto" }}>

      <div className="app-header" style={{ background: "rgba(22,28,36,0.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", padding: "12px 16px", paddingTop: "calc(12px + env(safe-area-inset-top))", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 100, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: "bold", color: C.green }}>Gollam</div>
          <div style={{ fontSize: 10, color: C.muted }}>Gestion Commerciale</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {enAttente > 0 && (
            <div style={{ background: C.yellow + "22", color: C.yellow, padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: "bold" }} title="Opérations en attente de synchronisation">
              ⏳ {enAttente}
            </div>
          )}
          {enAttenteFilet > 0 && (
            <div onClick={() => flushOutbox()} style={{ background: C.blue + "22", color: C.blue, padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: "bold", cursor: "pointer" }} title="Clients/promos/bons à synchroniser — clique pour réessayer">
              ☁️ {enAttenteFilet}
            </div>
          )}
          {estProprio && abonnement?.plan === "essai" && joursRestants != null && (
            <div style={{ background: (joursRestants <= 3 ? C.red : C.yellow) + "22", color: joursRestants <= 3 ? C.red : C.yellow, padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: "bold" }} title="Essai gratuit restant">
              ⏳ Essai {joursRestants}j
            </div>
          )}
          {!estPatron && (
            <div style={{ background: C.blue + "22", color: C.blue, padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: "bold" }}>
              👤 {monNom}
            </div>
          )}
          {peutVoirBenefice && (
            <>
              <div style={{ background: C.red + "22", color: C.red, padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: "bold" }}>
                -{fmt(kpi.dettes)}
              </div>
              <div style={{ background: kpi.benefice >= 0 ? C.green + "22" : C.red + "22", color: kpi.benefice >= 0 ? C.green : C.red, padding: "3px 8px", borderRadius: 10, fontSize: 10, fontWeight: "bold" }}>
                {kpi.benefice >= 0 ? "+" : ""}{fmt(kpi.benefice)}
              </div>
            </>
          )}
          <button onClick={() => setRechercheOuverte(true)} title="Recherche globale"
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}>
            🔍
          </button>
          <button onClick={() => setCompteOuvert(true)} title="Mon compte"
            style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12 }}>
            ⚙️
          </button>
        </div>
      </div>

      {rechercheOuverte && (
        <Suspense fallback={null}>
          <RechercheGlobale produits={produits} credits={credits} historique={historique}
            onNaviguer={(o) => setOnglet(o)} onClose={() => setRechercheOuverte(false)} />
        </Suspense>
      )}

      {surveillanceOuverte && !vueGlobale && boutiqueActive && (
        <Suspense fallback={null}>
          <Surveillance boutiqueActive={boutiqueActive} estPatron={estPatron}
            onRefresh={chargerDonnees} onClose={() => setSurveillanceOuverte(false)} />
        </Suspense>
      )}

      {compteOuvert && (
        <Compte email={session.user.email} onClose={() => setCompteOuvert(false)}
          onLogout={() => { setCompteOuvert(false); deconnecter(); }} onStatut={setStatut}
          onExport={() => { setCompteOuvert(false); exporterDonnees(); }}
          onRestaurer={(f) => { setCompteOuvert(false); restaurerSauvegarde(f); }}
          theme={theme} onTheme={changerTheme} langue={langue} onLangue={changerLangue}
          devise={DEVISE.code} onDevise={(code) => { appliquerDevise(code); window.location.reload(); }}
          boutiques={boutiques} boutiqueActive={boutiqueActive} vueGlobale={vueGlobale}
          proprietaireId={session.user.id} estPatron={estPatron}
          onSelectBoutique={(b) => { setBoutiqueActive(b); setVueGlobale(false); }}
          onGlobale={() => { setVueGlobale(true); if (onglet === "saisie") setOnglet("dashboard"); }}
          onBoutiqueCreated={(b) => { setBoutiques(prev => [...prev, b]); setBoutiqueActive(b); setVueGlobale(false); }}
          onBoutiqueUpdated={(b) => { setBoutiques(prev => prev.map(x => x.id === b.id ? b : x)); setBoutiqueActive(prev => prev?.id === b.id ? b : prev); }}
          onBoutiqueSupprimee={(b) => {
            // La boutique (et ses dépôts) disparaissent : on bascule sur une autre.
            const restantes = boutiques.filter(x => x.id !== b.id && x.parent_id !== b.id);
            setBoutiques(restantes);
            setVueGlobale(false);
            setBoutiqueActive(prev => (prev && restantes.some(x => x.id === prev.id)) ? prev : (restantes[0] || null));
            if (restantes.length === 0) { setCompteOuvert(false); setEstProprio(false); }
            chargerDonnees();
          }} />
      )}

      {/* RAPPEL FIN D'ESSAI — progressif : doux dès J-7, urgent à J-3 */}
      {estProprio && abonnement?.plan === "essai" && joursRestants != null && joursRestants <= 7 && (() => {
        const urgent = joursRestants <= 3;
        const col = urgent ? C.red : C.yellow;
        return (
          <div style={{ background: col + "18", borderBottom: `1px solid ${col}44`, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: col, fontSize: 12, fontWeight: "bold" }}>
              {urgent
                ? `⏳ Ton essai se termine dans ${joursRestants} jour${joursRestants > 1 ? "s" : ""} !`
                : `🎉 ${kpi.ca > 0 ? `Déjà ${fmt(kpi.ca)} de ventes — ` : ""}plus que ${joursRestants} jours d'essai`}
            </span>
            <button onClick={demanderAbonnement}
              style={{ background: C.green, color: C.bg, border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: "bold", cursor: "pointer", whiteSpace: "nowrap" }}>
              S'abonner
            </button>
          </div>
        );
      })()}

      {!enLigne && (
        <div style={{ background: C.yellow + "22", color: C.yellow, borderBottom: `1px solid ${C.yellow}44`, padding: "6px 12px", fontSize: 11, textAlign: "center", fontWeight: "bold" }}>
          📡 Hors-ligne — l'app reste consultable. Les nouvelles opérations attendront le retour du réseau.
        </div>
      )}

      {statut && (() => {
        const err = statut.startsWith("❌") || statut.startsWith("⚠️");
        const couleur = err ? C.red : C.green;
        return (
          <div onClick={() => setStatut("")} className="app-toast" style={{ position: "fixed", bottom: 74, left: "50%", transform: "translateX(-50%)", zIndex: 500, width: "calc(100% - 24px)", maxWidth: 456, animation: "fadeInUp 0.25s cubic-bezier(0.22,1,0.36,1)" }}>
            <div style={{ background: C.surface, border: `1px solid ${couleur}66`, borderLeft: `4px solid ${couleur}`, borderRadius: 10, padding: "11px 14px", fontSize: 13, color: C.text, boxShadow: "0 8px 28px rgba(0,0,0,0.45)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>{statut}</span>
            </div>
          </div>
        );
      })()}

      {estProprio && !rappelBackupMasque && enLigne && (() => {
        const jours = dernierBackup ? Math.floor((Date.now() - dernierBackup) / 86400000) : 999;
        if (jours < 7) return null;
        return (
          <div style={{ margin: "10px 12px 0", background: C.yellow + "18", border: `1px solid ${C.yellow}66`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>💾</span>
            <div style={{ flex: 1, fontSize: 12, color: C.text }}>
              {dernierBackup ? `Dernière sauvegarde il y a ${jours} jours.` : "Tu n'as pas encore sauvegardé tes données."} Pense à protéger ton business.
            </div>
            <button onClick={exporterDonnees} style={{ background: C.green, color: C.bg, border: "none", borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: "bold", cursor: "pointer", whiteSpace: "nowrap" }}>Sauvegarder</button>
            <button onClick={() => setRappelBackupMasque(true)} title="Plus tard" aria-label="Plus tard" style={{ background: "transparent", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", padding: "8px 10px", margin: "-8px -6px" }}>✕</button>
          </div>
        );
      })()}

      <div key={onglet} className="tab-content app-content" style={{ paddingTop: 12, paddingBottom: "calc(70px + env(safe-area-inset-bottom))" }}>
       <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>⏳ Chargement…</div>}>
        {onglet === "dashboard" && <Dashboard kpi={kpi} historique={historique} credits={credits} produits={produits} dettesFournisseurs={dettesFournisseurs} estPatron={peutVoirBenefice} onImprimer={h => imprimerFacture(h, boutique)} onWhatsApp={h => envoyerRecuWhatsApp(h, boutique)} onVoirCredits={() => setOnglet("credits")} cameras={(!vueGlobale && boutiqueActive?.cameras) || []} peutGererCameras={estPatron && !vueGlobale} onSurveillance={() => setSurveillanceOuverte(true)} />}
        {onglet === "saisie" && (
          <div style={{ padding: "0 12px 12px" }}>
            {vueGlobale ? (
              <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
                🌍 Vue globale active.<br />Choisis une boutique précise en haut pour enregistrer une opération.
              </div>
            ) : (
              <SaisieForm produits={produits} onSubmit={enregistrerForm} chargement={chargement} estEntrepot={estEntrepot} fournisseurs={fournisseurs} clientsConnus={clientsConnus} promos={promosActives} beneficiairesConnus={beneficiairesConnus} />
            )}
          </div>
        )}
        {onglet === "transferts" && (
          vueGlobale ? (
            <div style={{ padding: "0 12px" }}>
              <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
                🌍 Choisis une boutique précise en haut pour gérer ses transferts.
              </div>
            </div>
          ) : (
            <Transferts produits={produits} boutiques={boutiques} active={boutiqueActive} proprietaireId={session.user.id} transferts={transferts} onRefresh={chargerDonnees} onStatut={setStatut} />
          )
        )}
        {onglet === "historique" && <Historique historique={historique} produits={produits} boutiqueId={boutiqueActive?.id} onRefresh={chargerDonnees} onImprimer={h => imprimerFacture(h, boutique)} onWhatsApp={h => envoyerRecuWhatsApp(h, boutique)} onRetour={effectuerRetour} voirBenefice={peutVoirBenefice} peutRetourner={perms.vente_modifier || estPatron} peutModifier={perms.vente_modifier || estPatron} onSupprimer={supprimerMouvement} />}
        {onglet === "stock" && <Stock produits={produits} boutiqueId={boutiqueActive?.id} boutique={boutiqueActive} onRefresh={chargerDonnees} fournisseurs={fournisseurs} onTransfer={!vueGlobale && boutiques.length > 1 ? () => setOnglet("transferts") : null} voirPrixAchat={perms.prix_achat_voir} peutModifier={perms.stock_modifier || estPatron} onAudit={loggerModif} onStatut={setStatut} />}
        {onglet === "fournisseurs" && estPatron && (
          vueGlobale ? (
            <div style={{ padding: "0 12px" }}>
              <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
                🌍 Choisis une boutique précise en haut pour gérer le réassort.
              </div>
            </div>
          ) : (
            <Fournisseurs produits={produits} boutiqueActive={boutiqueActive} onRefresh={chargerDonnees} onStatut={setStatut} boutique={boutique} />
          )
        )}
        {onglet === "dettes_fourn" && estPatron && (
          vueGlobale ? (
            <div style={{ padding: "0 12px" }}>
              <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
                🌍 Choisis une boutique précise pour voir ses dettes fournisseurs.
              </div>
            </div>
          ) : (
            <DettesFournisseurs boutiqueId={boutiqueActive?.id} boutique={boutiqueActive} fournisseurs={fournisseurs} monNom={monNom} onStatut={setStatut} />
          )
        )}
        {onglet === "credits" && <Credits credits={credits} kpi={kpi} boutiqueId={boutiqueActive?.id} onRefresh={chargerDonnees} onStatut={setStatut} boutique={boutique} />}
        {onglet === "documents" && (
          vueGlobale ? (
            <div style={{ padding: "0 12px" }}>
              <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
                🌍 Choisis une boutique précise en haut pour gérer ses documents.
              </div>
            </div>
          ) : (
            <Documents produits={produits} boutiqueActive={boutiqueActive} boutique={boutique} credits={credits} historique={historique} clientsExtra={clientsManuels} onStatut={setStatut} prefill={docPrefill} onPrefillDone={() => setDocPrefill(null)} />
          )
        )}
        {onglet === "chat" && (
          vueGlobale ? (
            <div style={{ padding: "0 12px" }}>
              <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
                🌍 Choisis une boutique précise en haut pour discuter avec son équipe.
              </div>
            </div>
          ) : (
            <Messages
              boutiqueActive={boutiqueActive} userId={session.user.id} monNom={monNom} onStatut={setStatut}
              credits={credits} historique={historique} boutiqueId={boutiqueActive?.id} boutique={boutique}
              estPatron={estPatron} onRefresh={chargerDonnees}
              onImprimer={h => imprimerFacture(h, boutique)}
              onNouvelleVente={() => { setOnglet("saisie"); setStatut("🛒 Enregistre la vente/crédit pour ce client."); }}
              onDevis={(client, phone) => { setDocPrefill({ client, phone, type: "devis" }); setOnglet("documents"); }} />
          )
        )}
        {onglet === "caisse" && (
          vueGlobale ? (
            <div style={{ padding: "0 12px" }}>
              <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
                🌍 Choisis une boutique précise en haut pour clôturer sa caisse.
              </div>
            </div>
          ) : (
            <Cloture historique={historique} boutiqueActive={boutiqueActive} monNom={monNom} estPatron={estPatron} onStatut={setStatut} />
          )
        )}
        {onglet === "equipe" && estPatron && (
          vueGlobale ? (
            <div style={{ padding: "0 12px" }}>
              <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
                🌍 Choisis une boutique précise en haut pour gérer son équipe.
              </div>
            </div>
          ) : (
            <Equipe boutiqueActive={boutiqueActive} proprietaireId={session.user.id} historique={historique} onStatut={setStatut} />
          )
        )}
        {onglet === "inventaire" && estPatron && (
          vueGlobale ? (
            <div style={{ padding: "0 12px" }}>
              <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
                🌍 Choisis une boutique précise en haut pour faire l'inventaire.
              </div>
            </div>
          ) : (
            <Inventaire produits={produits} boutiqueActive={boutiqueActive} monNom={monNom} onRefresh={chargerDonnees} onStatut={setStatut} />
          )
        )}
        {onglet === "stats" && estPatron && <Stats kpi={kpi} historique={historique} produits={produits} credits={credits} boutique={boutique} boutiqueActive={boutiqueActive} vueGlobale={vueGlobale} onRefresh={chargerDonnees} />}
        {onglet === "bons_commande" && estPatron && (
          vueGlobale ? <div style={{ padding: "0 12px" }}><div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>🌍 Choisis une boutique précise pour gérer ses bons de commande.</div></div>
            : <BonsCommande produits={produits} fournisseurs={fournisseurs} boutiqueId={boutiqueActive?.id} monNom={monNom} onRefresh={chargerDonnees} onStatut={setStatut} />
        )}
        {onglet === "promotions" && estPatron && (
          vueGlobale ? <div style={{ padding: "0 12px" }}><div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>🌍 Choisis une boutique précise pour gérer ses promotions.</div></div>
            : <Promotions produits={produits} boutiqueId={boutiqueActive?.id} monNom={monNom} onStatut={setStatut} onRefresh={chargerPromos} clientsConnus={clientsConnus} boutique={boutiqueActive} />
        )}
        {onglet === "journal" && estPatron && <Journal boutiqueId={vueGlobale ? null : boutiqueActive?.id} />}
        {onglet === "admin" && estAdmin && <Admin onStatut={setStatut} />}
       </Suspense>
      </div>

      {/* MENU "PLUS" (onglets secondaires) */}
      {menuPlus && (
        <>
          <div onClick={() => setMenuPlus(false)} style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.5)" }} />
          <div style={{ position: "fixed", bottom: "calc(60px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 151, padding: "0 12px", boxSizing: "border-box" }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {secondaires.map(tab => {
                  const actif = onglet === tab.id;
                  return (
                    <button key={tab.id} onClick={() => { setOnglet(tab.id); setMenuPlus(false); }}
                      style={{ position: "relative", padding: "14px 6px", borderRadius: 10, cursor: "pointer",
                        border: `1px solid ${actif ? C.green : C.border}`, background: actif ? C.green + "18" : C.surface2 }}>
                      <div style={{ fontSize: 22 }}>{tab.label}</div>
                      <div style={{ fontSize: 10, color: actif ? C.green : C.text, marginTop: 4, fontWeight: actif ? "bold" : "normal" }}>{tab.title}</div>
                      {tab.badge > 0 && (
                        <div style={{ position: "absolute", top: 6, right: 6, background: C.red, color: "#fff", fontSize: 9, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>{tab.badge}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="app-nav" style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "rgba(22,28,36,0.9)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderTop: `1px solid ${C.border}`, display: "flex", boxSizing: "border-box", paddingBottom: "env(safe-area-inset-bottom)", boxShadow: "0 -4px 24px rgba(0,0,0,0.3)", zIndex: 152 }}>
        {/* Sur ordinateur les onglets sont rangés par section (Ventes, Stock,
            Achats, Acteurs…) ; sur téléphone ils restent à plat dans la barre. */}
        {estBureau
          ? groupesNav.map(g => (
              <React.Fragment key={g.titre}>
                <div className="nav-groupe">{g.titre}</div>
                {g.tabs.map(boutonOnglet)}
              </React.Fragment>
            ))
          : primaires.map(boutonOnglet)}
        {/* Bouton PLUS */}
        {secondaires.length > 0 && (
          <button onClick={() => setMenuPlus(o => !o)} className="nav-btn"
            style={{ flex: 1, padding: "7px 2px 6px", background: "transparent", border: "none", cursor: "pointer", position: "relative" }}>
            <div className="nav-ico" style={{ fontSize: 19, filter: menuPlus ? "none" : "grayscale(0.3) opacity(0.85)" }}>{menuPlus ? "✖️" : "⋯"}</div>
            <div className="nav-txt" style={{ fontSize: 9, color: menuPlus ? C.green : C.muted, marginTop: 2, fontWeight: menuPlus ? "bold" : "normal" }}>{t("plus")}</div>
            {badgeSecondaire && !menuPlus && (
              <div style={{ position: "absolute", top: 4, right: "50%", transform: "translateX(9px)", background: C.red, width: 8, height: 8, borderRadius: 4 }} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
