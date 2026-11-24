// Lecteur de guides détaillés au format Ganymède (JSON : { id, name, steps: [{ map, pos_x, pos_y, web_text }] }).
// Le fichier est lu dans le navigateur et gardé en local (localStorage) : rien n'est envoyé ni publié.
(() => {
  "use strict";
  const CLE_GUIDES = "guide-dofus:lecteur:guides";
  const CLE_ETAT = "guide-dofus:lecteur:etat";
  const $ = (id) => document.getElementById(id);
  const lire = (cle, defaut) => { try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; } };
  const ecrire = (cle, val) => { try { localStorage.setItem(cle, JSON.stringify(val)); return true; } catch { return false; } };

  if (/[?&]mode=overlay/.test(location.search)) document.body.classList.add("lecteur--overlay");

  let guides = lire(CLE_GUIDES, {});   // id -> guide
  let etat = lire(CLE_ETAT, {});       // id -> { etape, coches: { "etape|n": true } }
  let G = null;
  let n = 0;

  // ---------- Nettoyage du HTML (le fichier vient de l'extérieur) ----------
  const BALISES = new Set(["P", "BR", "SPAN", "DIV", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "U", "S", "IMG", "LABEL", "INPUT", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "A", "HR", "TABLE", "TBODY", "TR", "TD", "TH"]);
  // Images autorisées : DofusDB (icônes) et Ganymède (captures d'écran des guides).
  const IMAGES_OK = /^https:\/\/(api\.dofusdb\.fr|ganymede-app\.com|ganymede-dofus\.com)\//;
  const COULEURS = { "255, 255, 0": "jaune", "98, 172, 255": "bleu", "250, 0, 0": "rouge", "5, 160, 69": "vert", "216, 27, 67": "rouge" };
  function nettoyer(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
    const racine = doc.body.firstElementChild;
    (function parcourir(el) {
      [...el.children].forEach((c) => {
        if (!BALISES.has(c.tagName)) { c.replaceWith(...[...c.childNodes].filter((x) => x.nodeType === 3)); return; }
        const garde = {};
        const typ = c.getAttribute("data-type");
        if (typ) garde["data-type"] = typ;
        if (c.tagName === "IMG") { const s = c.getAttribute("src") || ""; if (!IMAGES_OK.test(s)) {
            // Capture hébergée ailleurs : simple mention à la place de l'image.
            if (c.classList.contains("img-large")) { const m = doc.createElement("p"); m.className = "capture-absente"; m.textContent = "📷 Capture d'écran (non affichée)"; c.replaceWith(m); } else c.remove();
            return;
          }
          garde.src = s; garde.loading = "lazy"; garde.alt = c.getAttribute("alt") || ""; if (c.classList.contains("img-large")) garde.class = "img-large"; }
        if (c.tagName === "INPUT") { if (c.getAttribute("type") !== "checkbox") { c.remove(); return; } garde.type = "checkbox"; }
        if (c.tagName === "A") { const h = c.getAttribute("href") || ""; if (/^https:\/\//.test(h)) { garde.href = h; garde.target = "_blank"; garde.rel = "noopener"; } }
        if (typ === "quest-block") { garde["data-statut"] = c.getAttribute("status") || ""; garde["data-quete"] = c.getAttribute("questname") || ""; }
        if (typ === "custom-tag") { garde["data-tag"] = c.getAttribute("type") || ""; const id = c.getAttribute("dofusdbid"); if (id) garde["data-dofusdb"] = id; }
        if (typ === "guide-step") garde["data-guide"] = c.getAttribute("label") || c.getAttribute("guidename") || "";
        const style = c.getAttribute("style") || "";
        const m = style.match(/color:\s*rgb\(([^)]+)\)/);
        if (m && COULEURS[m[1].trim()]) garde["data-couleur"] = COULEURS[m[1].trim()];
        if (c.className === "capture-absente") garde.class = "capture-absente";
        [...c.attributes].forEach((a) => c.removeAttribute(a.name));
        Object.entries(garde).forEach(([k, v]) => c.setAttribute(k, v));
        parcourir(c);
      });
    })(racine);
    return racine;
  }

  const STATUTS = { setup: "À préparer", start: "Lancer la quête", in_progress: "Quête en cours", end: "Valider la quête" };
  const ICONES_TAG = { quest: "img/outils/quest.webp", monster: "img/outils/bestiary.webp", dungeon: "img/outils/key.webp", item: "img/outils/inventory.webp" };
  const LIENS_DOFUSDB = { quest: "quests", monster: "bestiary/monster", item: "database/object", dungeon: "database/dungeon" };

  function enrichir(racine) {
    racine.querySelectorAll('[data-type="quest-block"]').forEach((b) => {
      const s = b.getAttribute("data-statut");
      const t = document.createElement("div");
      t.className = "qb__statut";
      t.textContent = STATUTS[s] || "Quête";
      b.prepend(t);
    });
    racine.querySelectorAll('[data-type="guide-step"]').forEach((t) => { if (t.querySelector("img")) return; const i = document.createElement("img"); i.src = "img/outils/quest.webp"; i.alt = ""; t.prepend(i); });
    racine.querySelectorAll('[data-type="custom-tag"]').forEach((t) => {
      const type = t.getAttribute("data-tag");
      const id = t.getAttribute("data-dofusdb");
      if (!t.querySelector("img") && ICONES_TAG[type]) { const i = document.createElement("img"); i.src = ICONES_TAG[type]; i.alt = ""; t.prepend(i); }
      if (id && LIENS_DOFUSDB[type]) {
        const a = document.createElement("a");
        a.href = `https://dofusdb.fr/fr/${LIENS_DOFUSDB[type]}/${encodeURIComponent(id)}`;
        a.target = "_blank"; a.rel = "noopener"; a.title = "Voir sur DofusDB";
        a.setAttribute("data-type", "custom-tag"); a.setAttribute("data-tag", type);
        a.append(...t.childNodes); t.replaceWith(a);
      }
    });
    // Positions écrites dans le texte ([x,y]) : clic = copie de la commande /travel.
    const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    const noeuds = [];
    while (marcheur.nextNode()) if (/\[\s*-?\d+\s*,\s*-?\d+\s*\]/.test(marcheur.currentNode.nodeValue)) noeuds.push(marcheur.currentNode);
    noeuds.forEach((nd) => {
      const frag = document.createDocumentFragment();
      nd.nodeValue.split(/(\[\s*-?\d+\s*,\s*-?\d+\s*\])/).forEach((morceau, i) => {
        if (i % 2 === 0) { if (morceau) frag.append(morceau); return; }
        const [x, y] = morceau.match(/-?\d+/g);
        frag.append(boutonPos(x, y, morceau.replace(/\s/g, "")));
      });
      nd.replaceWith(frag);
    });
    // Cases à cocher : numérotées dans l'étape, sauvegardées par guide.
    racine.querySelectorAll('input[type="checkbox"]').forEach((c, i) => {
      const k = `${n}|${i}`;
      c.className = "check";
      c.checked = !!etat[G.id].coches[k];
      c.dataset.cle = k;
      const li = c.closest("li");
      if (li) li.classList.toggle("is-fait", c.checked);
    });
    return racine;
  }

  function boutonPos(x, y, texte) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pos"; b.dataset.travel = `/travel ${x},${y}`;
    b.title = `Copier /travel ${x},${y}`;
    b.textContent = texte || `[${x},${y}]`;
    return b;
  }

  // ---------- Affichage ----------
  function rendreBiblio() {
    const liste = Object.values(guides);
    $("biblio").innerHTML = "";
    if (!liste.length) return;
    const h = document.createElement("h3"); h.textContent = "Mes guides ouverts"; $("biblio").append(h);
    liste.forEach((g) => {
      const e = etat[g.id] || { etape: 0, coches: {} };
      const ligne = document.createElement("div"); ligne.className = "biblio__ligne";
      const b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.dataset.ouvrir = g.id;
      b.textContent = `${g.name} · étape ${e.etape + 1}/${g.steps.length}`;
      const x = document.createElement("button"); x.type = "button"; x.className = "btn btn--small btn--ghost"; x.dataset.retirer = g.id; x.textContent = "Retirer"; x.title = "Retirer ce guide (la progression est gardée)";
      ligne.append(b, x); $("biblio").append(ligne);
    });
  }

  function ouvrir(id) {
    G = guides[id]; if (!G) return;
    etat[G.id] = etat[G.id] || { etape: 0, coches: {} };
    n = Math.min(etat[G.id].etape || 0, G.steps.length - 1);
    $("accueil").hidden = true; $("guide").hidden = false;
    $("nom-guide").textContent = G.name;
    $("auteur").textContent = G.auteur ? `${G.auteur} · via Ganymède` : "";
    $("total").textContent = G.steps.length;
    $("num").max = G.steps.length;
    rendreEtape();
  }

  function rendreEtape() {
    const s = G.steps[n];
    etat[G.id].etape = n; ecrire(CLE_ETAT, etat);
    $("num").value = n + 1;
    $("prec").disabled = n === 0; $("suiv").disabled = n === G.steps.length - 1;
    $("barre").style.width = `${((n + 1) / G.steps.length) * 100}%`;
    const pos = $("pos"); pos.innerHTML = "";
    if (s.name) { const t = document.createElement("strong"); t.textContent = s.name; pos.append(t); }
    if (s.pos_x != null && s.pos_y != null) pos.append(boutonPos(s.pos_x, s.pos_y));
    if (s.map) { const m = document.createElement("span"); m.className = "lecteur__map"; m.textContent = s.map; pos.append(m); }
    const texte = $("texte"); texte.innerHTML = "";
    texte.append(...enrichir(nettoyer(s.web_text)).childNodes);
    $("etape").scrollTop = 0;
    window.scrollTo({ top: 0 });
  }

  function aller(i) { if (!G) return; n = Math.max(0, Math.min(G.steps.length - 1, i)); rendreEtape(); }

  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("is-visible");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("is-visible"), 1800);
  }

  async function copier(txt) {
    try { await navigator.clipboard.writeText(txt); toast(`Copié : ${txt}`); }
    catch { toast(txt); }
  }

  // ---------- Fichiers ----------
  const texteSeul = (html) => (new DOMParser().parseFromString(String(html || ""), "text/html").body.textContent || "").trim().slice(0, 200);
  function valide(g) { return g && (typeof g.id === "number" || typeof g.id === "string") && Array.isArray(g.steps) && g.steps.every((s) => s && typeof s === "object"); }
  $("fichier").addEventListener("change", async (ev) => {
    let dernier = null;
    for (const f of ev.target.files) {
      try {
        const g = JSON.parse(await f.text());
        if (!valide(g)) { toast(`${f.name} : format de guide non reconnu`); continue; }
        guides[g.id] = { id: String(g.id), name: String(g.name || f.name), auteur: texteSeul(g.description), steps: g.steps.map((s) => ({ name: s.name || null, map: s.map || null, pos_x: Number.isFinite(+s.pos_x) && s.pos_x !== null ? +s.pos_x : null, pos_y: Number.isFinite(+s.pos_y) && s.pos_y !== null ? +s.pos_y : null, web_text: String(s.web_text || "") })) };
        dernier = String(g.id);
      } catch { toast(`${f.name} : fichier illisible`); }
    }
    ev.target.value = "";
    if (!ecrire(CLE_GUIDES, guides)) toast("Guide ouvert, mais trop gros pour être retenu après fermeture");
    rendreBiblio();
    if (dernier) ouvrir(dernier);
  });

  // ---------- Événements ----------
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("button, input");
    if (!t) return;
    if (t.dataset.travel) { copier(t.dataset.travel); return; }
    if (t.dataset.ouvrir) { ouvrir(t.dataset.ouvrir); return; }
    if (t.dataset.retirer) { delete guides[t.dataset.retirer]; ecrire(CLE_GUIDES, guides); rendreBiblio(); return; }
    if (t.id === "prec") aller(n - 1);
    if (t.id === "suiv") aller(n + 1);
    if (t.id === "fermer") { $("guide").hidden = true; $("accueil").hidden = false; rendreBiblio(); }
  });
  document.addEventListener("change", (ev) => {
    const c = ev.target;
    if (c.dataset && c.dataset.cle && G) {
      if (c.checked) etat[G.id].coches[c.dataset.cle] = true; else delete etat[G.id].coches[c.dataset.cle];
      ecrire(CLE_ETAT, etat);
      const li = c.closest("li"); if (li) li.classList.toggle("is-fait", c.checked);
    }
  });
  $("num").addEventListener("change", () => aller((+$("num").value || 1) - 1));
  document.addEventListener("keydown", (ev) => {
    if (!G || $("guide").hidden || ev.target.tagName === "INPUT") return;
    if (ev.key === "ArrowRight") aller(n + 1);
    if (ev.key === "ArrowLeft") aller(n - 1);
  });

  rendreBiblio();
  const dernierOuvert = new URLSearchParams(location.search).get("guide");
  if (dernierOuvert && guides[dernierOuvert]) ouvrir(dernierOuvert);
})();
