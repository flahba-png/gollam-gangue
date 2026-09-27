import { useState, useMemo, useRef, useEffect } from "react";
import { C, fmt, nb, heure, today, todayISO, MODES_PAIEMENT, envoyerWhatsApp } from "../theme";
import { supabase } from "../supabase";
import { msgErreur } from "../erreurs";
import { CULTURES, SACS, GRADES, calculerPesee, lireTrame, poidsStable, alertesPesee, cumulProducteur, texteTicket } from "../pesee";

// Balance intelligente pour l'achat de cultures commerciales (bord champ,
// magasin de collecte, coopérative). Lecture directe de la balance par câble
// USB/série quand le navigateur le permet (Chrome, Edge), sinon saisie à la main.
// Chaque ticket : entrée en stock (kg nets) + dépense d'achat si payé.

const PRIX_KEY = "gollam_pesee_prix"; // dernier prix au kilo par culture (confort)
const lirePrix = () => { try { return JSON.parse(localStorage.getItem(PRIX_KEY) || "{}"); } catch { return {}; } };
const memoriserPrix = (id, prix) => { try { localStorage.setItem(PRIX_KEY, JSON.stringify({ ...lirePrix(), [id]: prix })); } catch { /* ignore */ } };

const serieDispo = typeof navigator !== "undefined" && "serial" in navigator;
const numeroTicket = () => "PS-" + Date.now().toString(36).toUpperCase().slice(-6);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default function Balance({ produits = [], historique = [], boutiqueId, boutique, monNom, onRefresh, onStatut }) {
  const [cultureId, setCultureId] = useState("cacao");
  const culture = CULTURES.find(c => c.id === cultureId) || CULTURES[0];
  const produitCulture = produits.find(p => (p.nom || "").trim().toLowerCase() === culture.nom.toLowerCase());

  const [producteur, setProducteur] = useState("");
  const [telProducteur, setTelProducteur] = useState("");
  const [prixKg, setPrixKg] = useState(() => String(lirePrix().cacao || ""));
  const [gradeId, setGradeId] = useState("g1");
  const [primeKg, setPrimeKg] = useState("");
  const [sacId, setSacId] = useState("jute");
  const [tareSac, setTareSac] = useState("1");
  const [nbSacsForce, setNbSacsForce] = useState("");
  const [humidite, setHumidite] = useState("");
  const [humiditeNorme, setHumiditeNorme] = useState(String(culture.humiditeNorme));
  const [impuretes, setImpuretes] = useState("");
  const [impuretesNorme, setImpuretesNorme] = useState(String(culture.impuretesNorme));
  const [pesees, setPesees] = useState([]); // [{ kg, manuel }]
  const [poidsManuel, setPoidsManuel] = useState("");
  const [paye, setPaye] = useState(true);
  const [mode, setMode] = useState("especes");
  const [enCours, setEnCours] = useState(false);
  const [dernierTicket, setDernierTicket] = useState(null);

  // Balance connectée
  const [connectee, setConnectee] = useState(false);
  const [lecture, setLecture] = useState(null);   // { kg, stable }
  const [auto, setAuto] = useState(true);
  const [baud, setBaud] = useState("9600");
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const lecturesRef = useRef([]);
  const armeRef = useRef(true);   // prêt à capturer le prochain sac
  const autoRef = useRef(true);
  useEffect(() => { autoRef.current = auto; }, [auto]);
  useEffect(() => () => { deconnecter(); }, []);

  const choisirCulture = (c) => {
    setCultureId(c.id);
    setHumiditeNorme(String(c.humiditeNorme));
    setImpuretesNorme(String(c.impuretesNorme));
    const p = produits.find(x => (x.nom || "").trim().toLowerCase() === c.nom.toLowerCase());
    setPrixKg(String(lirePrix()[c.id] || p?.prix_achat || ""));
  };
  const choisirSac = (s) => { setSacId(s.id); setTareSac(String(s.tare)); };

  const ajouterPesee = (kg, manuel) => {
    const v = Math.round((Number(kg) || 0) * 100) / 100;
    if (v <= 0) return;
    setPesees(l => [...l, { kg: v, manuel }]);
    if (navigator.vibrate) navigator.vibrate(80);
  };

  // ---- Lecture série : chaque ligne reçue est une trame de poids ----
  const connecter = async () => {
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: parseInt(baud) || 9600 });
      portRef.current = port;
      setConnectee(true);
      onStatut("🔌 Balance connectée. Pose un sac sur le plateau.");
      const decodeur = new TextDecoderStream();
      port.readable.pipeTo(decodeur.writable).catch(() => {});
      const reader = decodeur.readable.getReader();
      readerRef.current = reader;
      let tampon = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        tampon += value;
        const lignes = tampon.split(/[\r\n]+/);
        tampon = lignes.pop();
        lignes.forEach(traiterTrame);
      }
    } catch (e) {
      if (e?.name !== "NotFoundError") onStatut(`❌ Balance : ${e?.message || "connexion impossible"}`);
    } finally {
      setConnectee(false);
    }
  };

  const traiterTrame = (trame) => {
    const l = lireTrame(trame);
    if (!l) return;
    lecturesRef.current = [...lecturesRef.current.slice(-19), l.kg];
    const stable = l.stable === false ? null : poidsStable(lecturesRef.current);
    setLecture({ kg: l.kg, stable: stable !== null });
    // Plateau vidé → on se réarme pour le sac suivant
    if (l.kg < 0.5) armeRef.current = true;
    if (autoRef.current && armeRef.current && stable !== null) {
      armeRef.current = false;
      ajouterPesee(stable, false);
    }
  };

  const deconnecter = async () => {
    try { await readerRef.current?.cancel(); } catch { /* ignore */ }
    try { await portRef.current?.close(); } catch { /* ignore */ }
    readerRef.current = null; portRef.current = null;
    setConnectee(false); setLecture(null);
  };

  // ---- Calcul en direct ----
  const grade = GRADES.find(g => g.id === gradeId) || GRADES[0];
  const nbSacs = nbSacsForce !== "" ? parseInt(nbSacsForce) || 0 : (sacId === "aucun" ? 0 : pesees.length);
  const calc = useMemo(() => calculerPesee({
    pesees: pesees.map(p => p.kg), nbSacs, tareSac: parseFloat(tareSac) || 0,
    humidite: parseFloat(humidite) || 0, humiditeNorme: parseFloat(humiditeNorme) || 0,
    impuretes: parseFloat(impuretes) || 0, impuretesNorme: parseFloat(impuretesNorme) || 0,
    prixKg: parseFloat(prixKg) || 0, ajustementGrade: grade.ajustement, primeKg: parseFloat(primeKg) || 0,
  }), [pesees, nbSacs, tareSac, humidite, humiditeNorme, impuretes, impuretesNorme, prixKg, grade, primeKg]);
  const alertes = alertesPesee({
    calc, nbSacs, humidite: parseFloat(humidite) || 0, humiditeNorme: parseFloat(humiditeNorme) || 0,
    saisieManuelle: pesees.some(p => p.manuel), pesees: pesees.map(p => p.kg),
  });

  const tickets = useMemo(() => historique.filter(h => h.details_facture?.type === "Pesée"), [historique]);
  const duJour = useMemo(() => {
    const j = tickets.filter(h => h.date_iso === todayISO());
    return { n: j.length, kg: j.reduce((s, h) => s + (h.details_facture.net || 0), 0), montant: j.reduce((s, h) => s + (h.details_facture.montant || 0), 0), aPayer: tickets.filter(h => !h.details_facture.paye).reduce((s, h) => s + (h.details_facture.montant || 0), 0) };
  }, [tickets]);
  const producteursConnus = useMemo(() => [...new Set(tickets.map(h => h.details_facture.producteur).filter(Boolean))], [tickets]);
  const cumul = cumulProducteur(historique, producteur);

  const choisirProducteur = (nom) => {
    setProducteur(nom);
    const t = tickets.find(h => h.details_facture.producteur === nom && h.details_facture.telephone);
    if (t && !telProducteur) setTelProducteur(t.details_facture.telephone);
  };

  const reset = () => {
    setPesees([]); setPoidsManuel(""); setNbSacsForce(""); setHumidite(""); setImpuretes("");
    setProducteur(""); setTelProducteur(""); setPrimeKg(""); setPaye(true);
    lecturesRef.current = []; armeRef.current = true;
  };

  // Enregistre la dépense d'achat (argent remis au producteur)
  const ecrireDepense = (d, modeP) => supabase.from("historique").insert({
    boutique_id: boutiqueId, heure: heure(), date_iso: todayISO(), type: "depense",
    texte: `💸 Achat ${nb(d.net)} kg ${d.culture} — ${d.producteur || "producteur"} (ticket ${d.numero})`,
    montant: d.montant, benefice_etabli: 0, mode_paiement: modeP, vendeur_nom: monNom,
    details_facture: { beneficiaire: d.producteur || null, ticket: d.numero },
  });

  const valider = async () => {
    if (pesees.length === 0) { onStatut("⚠️ Aucune pesée : pose un sac ou saisis un poids."); return; }
    if (calc.net <= 0) { onStatut("⚠️ Poids net nul : vérifie la tare."); return; }
    if (!(parseFloat(prixKg) > 0)) { onStatut("⚠️ Indique le prix du kilo."); return; }
    setEnCours(true);
    const numero = numeroTicket();
    const kgStock = Math.round(calc.net); // le stock est tenu en kg entiers

    // 1. Stock : la culture est un produit, compté en kg
    const { data: existant } = await supabase.from("produits").select("*").eq("boutique_id", boutiqueId).ilike("nom", culture.nom).maybeSingle();
    const { error: errStock } = existant
      ? await supabase.from("produits").update({ stock: (existant.stock || 0) + kgStock, prix_achat: calc.prixApplique }).eq("id", existant.id)
      : await supabase.from("produits").insert({ boutique_id: boutiqueId, nom: culture.nom, prix_achat: calc.prixApplique, prix_vente: 0, stock: kgStock });
    if (errStock) { setEnCours(false); onStatut(msgErreur(errStock, "La mise en stock")); return; }

    // 2. Ticket de pesée (tracé comme une entrée de stock)
    const details = {
      type: "Pesée", numero, culture: culture.nom, cultureId: culture.id, producteur: producteur.trim(), telephone: telProducteur.trim() || null,
      pesees: pesees.map(p => p.kg), saisieManuelle: pesees.some(p => p.manuel), nbSacs, tareSac: parseFloat(tareSac) || 0,
      humidite: parseFloat(humidite) || 0, humiditeNorme: parseFloat(humiditeNorme) || 0,
      impuretes: parseFloat(impuretes) || 0, impuretesNorme: parseFloat(impuretesNorme) || 0,
      grade: grade.nom, prixKg: parseFloat(prixKg) || 0, primeKg: parseFloat(primeKg) || 0,
      ...calc, paye, mode_paiement: paye ? mode : null, alertes,
    };
    const { data: ligne, error } = await supabase.from("historique").insert({
      boutique_id: boutiqueId, heure: heure(), date_iso: todayISO(), type: "ajout",
      texte: `⚖️ Pesée ${nb(calc.net)} kg ${culture.nom}${producteur.trim() ? ` — ${producteur.trim()}` : ""} (ticket ${numero})`,
      montant: 0, benefice_etabli: 0, vendeur_nom: monNom, details_facture: details,
    }).select().maybeSingle();
    if (error) { setEnCours(false); onStatut(msgErreur(error, "Le ticket de pesée")); return; }

    // 3. Paiement immédiat → dépense
    if (paye) {
      const { error: errDep } = await ecrireDepense(details, mode);
      if (errDep) onStatut(msgErreur(errDep, "La dépense d'achat"));
    }
    setEnCours(false);
    memoriserPrix(culture.id, parseFloat(prixKg) || 0);
    setDernierTicket({ ...(ligne || {}), details_facture: details, heure: ligne?.heure || heure() });
    onStatut(`✅ Ticket ${numero} : ${nb(calc.net)} kg ${culture.nom} · ${fmt(calc.montant)}${paye ? "" : " (à payer)"}`);
    reset();
    onRefresh();
  };

  const marquerPaye = async (h) => {
    const d = h.details_facture;
    const { error } = await ecrireDepense(d, "especes");
    if (error) { onStatut(msgErreur(error, "Le paiement")); return; }
    await supabase.from("historique").update({ details_facture: { ...d, paye: true, mode_paiement: "especes" } }).eq("id", h.id);
    onStatut(`✅ ${d.producteur || "Producteur"} payé : ${fmt(d.montant)}`);
    onRefresh();
  };

  const texteDe = (h) => {
    const d = h.details_facture;
    const c = CULTURES.find(x => x.id === d.cultureId) || { nom: d.culture, emoji: "⚖️" };
    return texteTicket({ numero: d.numero, boutique, culture: c, producteur: d.producteur, calc: d, grade: d.grade, humidite: d.humidite, impuretes: d.impuretes, nbSacs: d.nbSacs, date: h.date_iso ? h.date_iso.split("-").reverse().join("/") : today(), heure: h.heure, fmt, paye: d.paye });
  };
  const imprimer = (h) => {
    const w = window.open("", "_blank", "width=380,height=600");
    if (!w) return;
    w.document.write(`<html><head><title>Ticket de pesée</title><style>@page{size:58mm auto;margin:0}body{font-family:'Courier New',monospace;width:54mm;margin:0 auto;padding:8px;font-size:12px;color:#000;white-space:pre-wrap}</style></head><body>${esc(texteDe(h).replace(/\*/g, ""))}<script>window.onload=()=>window.print()</` + `script></body></html>`);
    w.document.close();
  };

  const lectureStable = lecture?.stable;

  return (
    <div style={{ padding: "0 12px 12px" }}>
      {/* RÉSUMÉ DU JOUR */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
        {[
          { l: "Tickets du jour", v: duJour.n, c: C.text },
          { l: "Kg achetés", v: `${nb(Math.round(duJour.kg))} kg`, c: C.green },
          { l: "Reste à payer", v: fmt(duJour.aPayer), c: duJour.aPayer > 0 ? C.red : C.muted },
        ].map(k => (
          <div key={k.l} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 9, color: C.muted, fontWeight: "bold" }}>{k.l.toUpperCase()}</div>
            <div style={{ fontSize: 15, fontWeight: "bold", color: k.c, marginTop: 2 }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.green}55`, padding: 14, marginBottom: 12 }}>
        <div style={{ fontWeight: "bold", color: C.text, fontSize: 14, marginBottom: 10 }}>⚖️ Nouvelle pesée</div>

        {/* CULTURE */}
        <label style={lbl}>CULTURE</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {CULTURES.map(c => <Puce key={c.id} actif={c.id === cultureId} onClick={() => choisirCulture(c)}>{c.emoji} {c.nom}</Puce>)}
        </div>
        {produitCulture && <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>En stock : <b style={{ color: C.text }}>{nb(produitCulture.stock || 0)} kg</b> de {culture.nom}</div>}

        {/* PRODUCTEUR */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginTop: 10 }}>
          <div>
            <label style={lbl}>👨‍🌾 PRODUCTEUR</label>
            <input list="producteurs-connus" value={producteur} onChange={e => choisirProducteur(e.target.value)} placeholder="Nom du planteur" style={inp} />
            <datalist id="producteurs-connus">{producteursConnus.map(p => <option key={p} value={p} />)}</datalist>
          </div>
          <div>
            <label style={lbl}>TÉLÉPHONE</label>
            <input type="tel" inputMode="tel" value={telProducteur} onChange={e => setTelProducteur(e.target.value)} placeholder="07…" style={inp} />
          </div>
        </div>
        {cumul.tickets > 0 && (
          <div style={{ fontSize: 11, color: C.blue, marginTop: 6 }}>
            📒 Déjà {cumul.tickets} ticket(s) : {nb(cumul.kg)} kg · {fmt(cumul.montant)}
          </div>
        )}

        {/* BALANCE */}
        <div style={{ background: C.surface2, borderRadius: 10, padding: 12, marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: "bold" }}>
              {connectee ? "🟢 BALANCE CONNECTÉE" : serieDispo ? "⚪ BALANCE NON CONNECTÉE" : "⚪ SAISIE MANUELLE"}
            </span>
            {serieDispo && (connectee ? (
              <button onClick={deconnecter} style={btnSec}>Déconnecter</button>
            ) : (
              <span style={{ display: "flex", gap: 6 }}>
                <select value={baud} onChange={e => setBaud(e.target.value)} style={{ ...inp, width: "auto", padding: "6px 8px", fontSize: 11 }} title="Vitesse du port (voir notice de la balance)">
                  {["2400", "4800", "9600", "19200", "38400", "115200"].map(b => <option key={b} value={b}>{b} bauds</option>)}
                </select>
                <button onClick={connecter} style={{ ...btnSec, color: C.green, borderColor: C.green }}>🔌 Connecter</button>
              </span>
            ))}
          </div>

          {connectee && (
            <>
              <div style={{ textAlign: "center", margin: "10px 0 4px", fontFamily: "monospace", fontSize: 40, fontWeight: "bold", color: lectureStable ? C.green : C.yellow }}>
                {lecture ? lecture.kg.toFixed(2) : "--.--"} <span style={{ fontSize: 16 }}>kg</span>
              </div>
              <div style={{ textAlign: "center", fontSize: 11, color: lectureStable ? C.green : C.yellow }}>
                {lectureStable ? "✔ Poids stable" : "… stabilisation"}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => ajouterPesee(lecture?.kg, false)} disabled={!lectureStable}
                  style={{ ...btnPrim, flex: 1, background: lectureStable ? C.green : C.muted }}>➕ Prendre ce poids</button>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.text }}>
                  <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Auto
                </label>
              </div>
              {auto && <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>Mode auto : chaque sac est enregistré dès que le poids se stabilise ; retire-le du plateau pour peser le suivant.</div>}
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input type="number" inputMode="decimal" step="0.01" value={poidsManuel} onChange={e => setPoidsManuel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { ajouterPesee(poidsManuel, true); setPoidsManuel(""); } }}
              placeholder="Poids lu (kg)" style={{ ...inp, flex: 1 }} />
            <button onClick={() => { ajouterPesee(poidsManuel, true); setPoidsManuel(""); }} style={btnSec}>➕ Ajouter</button>
          </div>

          {pesees.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {pesees.map((p, i) => (
                <span key={i} style={{ fontSize: 12, padding: "5px 8px", borderRadius: 12, background: C.surface, border: `1px solid ${p.manuel ? C.yellow : C.border}`, color: C.text }}>
                  #{i + 1} {p.kg} kg{p.manuel ? " ✍️" : ""}
                  <button onClick={() => setPesees(l => l.filter((_, j) => j !== i))} aria-label="Retirer cette pesée"
                    style={{ marginLeft: 6, background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* SACS / TARE */}
        <label style={{ ...lbl, marginTop: 12 }}>SACS (TARE)</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SACS.map(s => <Puce key={s.id} actif={s.id === sacId} onClick={() => choisirSac(s)}>{s.nom}{s.tare ? ` · ${s.tare} kg` : ""}</Puce>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
          <div><label style={lbl}>NOMBRE DE SACS</label><input type="number" inputMode="numeric" value={nbSacsForce} onChange={e => setNbSacsForce(e.target.value)} placeholder={`${nbSacs} (auto)`} style={inp} /></div>
          <div><label style={lbl}>TARE PAR SAC (KG)</label><input type="number" inputMode="decimal" step="0.05" value={tareSac} onChange={e => setTareSac(e.target.value)} style={inp} /></div>
        </div>

        {/* QUALITÉ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <div><label style={lbl}>💧 HUMIDITÉ MESURÉE (%)</label><input type="number" inputMode="decimal" step="0.1" value={humidite} onChange={e => setHumidite(e.target.value)} placeholder={`norme ${humiditeNorme} %`} style={inp} /></div>
          <div><label style={lbl}>NORME HUMIDITÉ (%)</label><input type="number" inputMode="decimal" step="0.1" value={humiditeNorme} onChange={e => setHumiditeNorme(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>🪨 IMPURETÉS (%)</label><input type="number" inputMode="decimal" step="0.1" value={impuretes} onChange={e => setImpuretes(e.target.value)} placeholder={`tolérance ${impuretesNorme} %`} style={inp} /></div>
          <div><label style={lbl}>TOLÉRANCE IMPURETÉS (%)</label><input type="number" inputMode="decimal" step="0.1" value={impuretesNorme} onChange={e => setImpuretesNorme(e.target.value)} style={inp} /></div>
        </div>
        <label style={{ ...lbl, marginTop: 10 }}>GRADE</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {GRADES.map(g => <Puce key={g.id} actif={g.id === gradeId} onClick={() => setGradeId(g.id)}>{g.nom}{g.ajustement ? ` (${g.ajustement} %)` : ""}</Puce>)}
        </div>

        {/* PRIX */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <div><label style={lbl}>PRIX DU KILO *</label><input type="number" inputMode="numeric" value={prixKg} onChange={e => setPrixKg(e.target.value)} placeholder="Ex: 2200" style={inp} /></div>
          <div><label style={lbl}>PRIME / KG (certif.)</label><input type="number" inputMode="numeric" value={primeKg} onChange={e => setPrimeKg(e.target.value)} placeholder="0" style={inp} /></div>
        </div>

        {/* DÉCOMPTE EN DIRECT */}
        <div style={{ background: C.surface2, borderRadius: 10, padding: 12, marginTop: 12, fontSize: 12 }}>
          <Ligne l={`Poids brut (${pesees.length} pesée${pesees.length > 1 ? "s" : ""})`} v={`${calc.brut} kg`} />
          <Ligne l={`Tare (${nbSacs} × ${parseFloat(tareSac) || 0} kg)`} v={`−${calc.tare} kg`} c={C.muted} />
          {calc.refactionHumidite > 0 && <Ligne l={`Réfaction humidité (+${calc.excesHumidite} pts)`} v={`−${calc.refactionHumidite} kg`} c={C.yellow} />}
          {calc.refactionImpuretes > 0 && <Ligne l="Réfaction impuretés" v={`−${calc.refactionImpuretes} kg`} c={C.yellow} />}
          <div style={{ borderTop: `1px dashed ${C.border}`, margin: "6px 0" }} />
          <Ligne l={<b>Poids net payé</b>} v={<b>{calc.net} kg</b>} c={C.text} />
          <Ligne l={`Prix appliqué${calc.tauxRefaction > 0 ? ` · réfaction ${calc.tauxRefaction} %` : ""}`} v={`${fmt(calc.prixApplique)} / kg`} c={C.muted} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6 }}>
            <span style={{ color: C.muted }}>À verser au producteur</span>
            <span style={{ fontSize: 22, fontWeight: "bold", color: C.green }}>{fmt(calc.montant)}</span>
          </div>
        </div>

        {alertes.length > 0 && (
          <div style={{ marginTop: 10, background: C.yellow + "18", border: `1px solid ${C.yellow}66`, borderRadius: 8, padding: 10 }}>
            {alertes.map(a => <div key={a} style={{ fontSize: 11, color: C.yellow }}>⚠️ {a}</div>)}
          </div>
        )}

        {/* PAIEMENT */}
        <label style={{ ...lbl, marginTop: 12 }}>PAIEMENT</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Puce actif={!paye} onClick={() => setPaye(false)}>⏳ Payer plus tard</Puce>
          {MODES_PAIEMENT.map(m => <Puce key={m.id} actif={paye && mode === m.id} onClick={() => { setPaye(true); setMode(m.id); }}>{m.emoji} {m.label}</Puce>)}
        </div>

        <button onClick={valider} disabled={enCours || pesees.length === 0}
          style={{ ...btnPrim, width: "100%", marginTop: 14, padding: 13, fontSize: 15, background: (enCours || pesees.length === 0) ? C.muted : C.green }}>
          {enCours ? "..." : `Valider le ticket · ${fmt(calc.montant)}`}
        </button>
      </div>

      {/* DERNIER TICKET : partage immédiat */}
      {dernierTicket && (
        <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.blue}66`, padding: 14, marginBottom: 12 }}>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: C.text, margin: 0, fontFamily: "monospace" }}>{texteDe(dernierTicket).replace(/\*/g, "")}</pre>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => envoyerWhatsApp(dernierTicket.details_facture.telephone || "", texteDe(dernierTicket))} style={{ ...btnSec, flex: 1, color: C.green, borderColor: C.green }}>📲 WhatsApp</button>
            <button onClick={() => imprimer(dernierTicket)} style={{ ...btnSec, flex: 1 }}>🖨️ Imprimer</button>
            <button onClick={() => setDernierTicket(null)} style={btnSec}>✕</button>
          </div>
        </div>
      )}

      {/* DERNIERS TICKETS */}
      <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, padding: 14 }}>
        <div style={{ color: C.muted, fontWeight: "bold", fontSize: 11, marginBottom: 10 }}>⚖️ 30 DERNIERS TICKETS ({Math.min(tickets.length, 30)})</div>
        {tickets.length === 0 && <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic" }}>Aucune pesée pour l'instant.</div>}
        {tickets.slice(0, 30).map(h => {
          const d = h.details_facture;
          return (
            <div key={h.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 12 }}>{d.culture} · {nb(d.net)} kg{d.producteur ? ` — ${d.producteur}` : ""}</div>
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                    {d.numero} · {h.date_iso} {h.heure}{h.vendeur_nom ? ` · 👤 ${h.vendeur_nom}` : ""}{d.saisieManuelle ? " · ✍️ manuel" : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ color: d.paye ? C.text : C.red, fontSize: 12, fontWeight: "bold" }}>{fmt(d.montant)}</div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
                    {!d.paye && <button onClick={() => marquerPaye(h)} style={{ ...btnMini, color: C.green, borderColor: C.green }}>Payer</button>}
                    <button onClick={() => envoyerWhatsApp(d.telephone || "", texteDe(h))} style={btnMini} aria-label="Envoyer le ticket par WhatsApp">📲</button>
                    <button onClick={() => imprimer(h)} style={btnMini} aria-label="Imprimer le ticket">🖨️</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Puce({ actif, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: "7px 11px", borderRadius: 14, fontSize: 12, fontWeight: "bold", cursor: "pointer",
        border: `1px solid ${actif ? C.green : C.border}`, background: actif ? C.green + "22" : "transparent", color: actif ? C.green : C.muted }}>
      {children}
    </button>
  );
}

function Ligne({ l, v, c }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: c || C.muted }}>
      <span>{l}</span><span>{v}</span>
    </div>
  );
}

const inp = { padding: "10px 12px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, boxSizing: "border-box", width: "100%" };
const lbl = { display: "block", fontSize: 9, color: "var(--muted)", fontWeight: "bold", letterSpacing: 0.5, marginBottom: 4 };
const btnPrim = { padding: 10, color: "var(--bg)", border: "none", borderRadius: 8, fontWeight: "bold", fontSize: 13, cursor: "pointer" };
const btnSec = { padding: "8px 12px", background: "transparent", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: "bold", fontSize: 12, cursor: "pointer" };
const btnMini = { padding: "3px 7px", background: "transparent", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11, cursor: "pointer" };
