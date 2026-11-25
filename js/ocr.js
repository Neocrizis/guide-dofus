// Lecture du chat (appli Windows) : l'appli lit le chat du jeu par OCR et transmet les lignes ici.
// « Quête terminée : X » coche la quête X ; « Succès déverrouillé : [X] » coche la case X du guide.
// Les fautes de lecture courantes sont tolérées (comparaison approchée). Chaque coche peut être annulée.
(() => {
  "use strict";
  const G = () => window.GuideDofus;
  const DATA = window.QUETES || { quetes: {} };

  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[|l1]'/g, "l'").replace(/[^a-z0-9]+/g, " ").trim();
  function distance(a, b) {
    const m = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++) {
      let p = m[0]; m[0] = i;
      for (let j = 1; j <= b.length; j++) { const t = m[j]; m[j] = Math.min(m[j] + 1, m[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; }
    }
    return m[b.length];
  }
  // Renvoie la valeur dont le nom ressemble le plus (au plus ~12 % de caractères différents).
  function proche(nom, liste) {
    const n = norm(nom);
    if (n.length < 3) return null;
    let meilleur = null, d = Infinity;
    for (const [cle, val] of liste) {
      const k = norm(cle);
      if (Math.abs(k.length - n.length) > d) continue;
      const x = distance(n, k);
      if (x < d) { d = x; meilleur = { nom: cle, val }; }
    }
    return d <= Math.max(1, Math.floor(n.length * 0.12)) ? meilleur : null;
  }

  let quetes = null, cases = null;
  function index() {
    if (quetes) return;
    quetes = Object.entries(DATA.quetes).map(([id, v]) => [v[0], +id]);
    cases = [];
    (window.GUIDES || []).forEach((g) => g.etapes.forEach((e) => (e.succes || []).forEach((s, i) => {
      cases.push([String(s).replace(/^[^:]+ : /, ""), `${e.id}|${i}`]);
    })));
  }

  const vues = new Set(); // lignes déjà traitées (horodatage compris), pour ne rien compter deux fois
  function traiterLigne(ligne) {
    const t = String(ligne).replace(/\s+/g, " ").trim();
    if (!t || vues.has(t)) return null;
    vues.add(t);
    if (vues.size > 500) vues.delete(vues.values().next().value);
    index();
    const etat = G().etat();
    let m = t.match(/qu[eê]te termin[ée]e?\s*[:;]\s*(.+?)\s*\.?$/i);
    if (m) {
      const actions = [];
      const q = proche(m[1], quetes);
      if (q && !etat.quetes?.[q.val]) actions.push({ type: "quete", id: q.val, nom: q.nom });
      const c = proche(m[1], cases); // certaines cases du guide sont des quêtes
      if (c && !etat.succes[c.val]) actions.push({ type: "case", cle: c.val, nom: c.nom });
      return actions.length ? { titre: `Quête terminée : ${(q || c).nom}`, actions } : null;
    }
    m = t.match(/succ[eè]s d[ée]verrouill[ée]\s*[:;]\s*\[?([^\]]+)\]?/i);
    if (m) {
      const c = proche(m[1], cases);
      if (c && !etat.succes[c.val]) return { titre: `Succès : ${c.nom}`, actions: [{ type: "case", cle: c.val, nom: c.nom }] };
    }
    return null;
  }

  function appliquer(actions, valeur) {
    const etat = G().etat();
    actions.forEach((a) => {
      if (a.type === "quete") { etat.quetes = etat.quetes || {}; if (valeur) etat.quetes[a.id] = 1; else delete etat.quetes[a.id]; }
      if (a.type === "case") { if (valeur) etat.succes[a.cle] = true; else delete etat.succes[a.cle]; }
    });
    G().rafraichir();
  }

  // Bandeau « ✓ Quête cochée » avec un bouton Annuler (10 s).
  function bandeau(res) {
    let el = document.getElementById("ocr-note");
    if (!el) {
      el = document.createElement("div"); el.id = "ocr-note"; el.className = "ocr-note"; el.setAttribute("role", "status");
      document.body.append(el);
    }
    el.innerHTML = "";
    const t = document.createElement("span"); t.textContent = `✓ ${res.titre}`;
    const b = document.createElement("button"); b.type = "button"; b.className = "btn btn--small"; b.textContent = "Annuler";
    b.onclick = () => { appliquer(res.actions, false); el.classList.remove("is-visible"); G().toast("Coche annulée"); };
    el.append(t, b); el.classList.add("is-visible");
    clearTimeout(bandeau.t); bandeau.t = setTimeout(() => el.classList.remove("is-visible"), 10000);
  }

  // Appelée par l'appli avec les lignes lues. Renvoie le nombre de coches faites.
  window.GuideDofusOcr = (lignes) => {
    if (!G()) return 0;
    let n = 0;
    (Array.isArray(lignes) ? lignes : [lignes]).forEach((l) => {
      const res = traiterLigne(l);
      if (!res) return;
      appliquer(res.actions, true);
      res.actions.filter((a) => a.type === "quete").forEach((a) => G().noter(a.nom, "Quête terminée (chat)"));
      bandeau(res); n++;
    });
    return n;
  };
  window.GuideDofusOcr.tester = traiterLigne; // pour les tests
})();
