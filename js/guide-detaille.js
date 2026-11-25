// Affichage du contenu des guides détaillés au format Ganymède (web_text en HTML TipTap).
// Partagé par le guide principal (js/app.js, site et appli) et le lecteur (js/lecteur.js).
// Le HTML vient de l'extérieur : il est nettoyé (liste blanche de balises et d'attributs).
(() => {
  "use strict";
  const BALISES = new Set(["P", "BR", "SPAN", "DIV", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "U", "S", "IMG", "LABEL", "INPUT", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "A", "HR", "TABLE", "TBODY", "TR", "TD", "TH"]);
  // Images autorisées : DofusDB (icônes) et captures hébergées sur le site.
  const IMAGES_OK = /^(https:\/\/(api\.dofusdb\.fr|ganymede-app\.com|ganymede-dofus\.com)\/|img\/guides\/[\w-]+\/[\w-]+\.(webp|png|jpg)$)/;
  const COULEURS = { "255, 255, 0": "jaune", "98, 172, 255": "bleu", "250, 0, 0": "rouge", "5, 160, 69": "vert", "216, 27, 67": "rouge" };
  const STATUTS = { setup: "À préparer", start: "Lancer la quête", in_progress: "Quête en cours", end: "Valider la quête" };
  const ICONES_TAG = { quest: "img/outils/quest.webp", monster: "img/outils/bestiary.webp", dungeon: "img/outils/key.webp", item: "img/outils/inventory.webp" };
  const LIENS_DOFUSDB = { quest: "quests", monster: "bestiary/monster", item: "database/object", dungeon: "database/dungeon" };
  // Chemins absolus : le contenu peut être affiché dans une autre fenêtre (overlay Picture-in-Picture).
  const abs = (src) => (/^https:/.test(src) ? src : new URL(src, location.href).href);

  function nettoyer(html) {
    const doc = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
    const racine = doc.body.firstElementChild;
    (function parcourir(el) {
      [...el.children].forEach((c) => {
        if (!BALISES.has(c.tagName)) { c.replaceWith(...[...c.childNodes].filter((x) => x.nodeType === 3)); return; }
        const garde = {};
        const typ = c.getAttribute("data-type");
        if (typ) garde["data-type"] = typ;
        if (c.tagName === "IMG") {
          const s = c.getAttribute("src") || "";
          if (!IMAGES_OK.test(s)) {
            if (c.classList.contains("img-large")) { const m = doc.createElement("p"); m.className = "capture-absente"; m.textContent = "📷 Capture d'écran (non affichée)"; c.replaceWith(m); } else c.remove();
            return;
          }
          garde.src = abs(s); garde.loading = "lazy"; garde.alt = c.getAttribute("alt") || "";
          if (c.classList.contains("img-large")) garde.class = "img-large";
        }
        if (c.tagName === "INPUT") { if (c.getAttribute("type") !== "checkbox") { c.remove(); return; } garde.type = "checkbox"; }
        if (c.tagName === "A") { const h = c.getAttribute("href") || ""; if (/^https:\/\//.test(h)) { garde.href = h; garde.target = "_blank"; garde.rel = "noopener"; } }
        if (typ === "quest-block") { garde["data-statut"] = c.getAttribute("status") || ""; garde["data-quete"] = c.getAttribute("questname") || ""; }
        if (typ === "custom-tag") { garde["data-tag"] = c.getAttribute("type") || ""; const id = c.getAttribute("dofusdbid"); if (id) garde["data-dofusdb"] = id; }
        if (typ === "guide-step") {
          garde["data-guide"] = c.getAttribute("label") || c.getAttribute("guidename") || "";
          const gi = c.getAttribute("guideid"), sn = c.getAttribute("stepnumber");
          if (gi === "0") garde["data-vers"] = "self"; // même guide
          else if (/^\d+$/.test(gi || "")) garde["data-vers"] = `gany-${gi}`;
          if (/^\d+$/.test(sn || "")) garde["data-etape"] = sn;
        }
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

  function boutonPos(x, y, texte, doc = document) {
    const b = doc.createElement("button");
    b.type = "button"; b.className = "pos"; b.dataset.travel = `/travel ${x},${y}`;
    b.title = `Copier /travel ${x},${y}`;
    b.textContent = texte || `[${x},${y}]`;
    return b;
  }

  // options : guide -> id du guide affiché, cle(i) -> identifiant de la i-ème case, coches -> { cle: true }, integres -> guides ouvrables (lecteur).
  function enrichir(racine, { cle, coches = {}, integres = [], guide } = {}) {
    const doc = racine.ownerDocument;
    const img = (src) => { const i = doc.createElement("img"); i.src = abs(src); i.alt = ""; return i; };
    racine.querySelectorAll('[data-type="quest-block"]').forEach((b) => {
      const t = doc.createElement("div");
      t.className = "qb__statut";
      t.textContent = STATUTS[b.getAttribute("data-statut")] || "Quête";
      b.prepend(t);
    });
    racine.querySelectorAll('[data-type="guide-step"]').forEach((t) => {
      if (!t.querySelector("img")) t.prepend(img("img/outils/quest.webp"));
      if (t.getAttribute("data-vers") === "self") { if (guide) t.setAttribute("data-vers", guide); else t.removeAttribute("data-vers"); }
      const vers = t.getAttribute("data-vers");
      if (vers && integres.some((g) => g.id === vers)) {
        const b = doc.createElement("button"); b.type = "button"; b.setAttribute("data-type", "guide-step");
        b.dataset.allerGuide = vers; b.dataset.allerEtape = t.getAttribute("data-etape") || "1";
        b.append(...t.childNodes); t.replaceWith(b);
      }
    });
    racine.querySelectorAll('[data-type="custom-tag"]').forEach((t) => {
      const type = t.getAttribute("data-tag");
      const id = t.getAttribute("data-dofusdb");
      if (!t.querySelector("img") && ICONES_TAG[type]) t.prepend(img(ICONES_TAG[type]));
      if (id && LIENS_DOFUSDB[type]) {
        const a = doc.createElement("a");
        a.href = `https://dofusdb.fr/fr/${LIENS_DOFUSDB[type]}/${encodeURIComponent(id)}`;
        a.target = "_blank"; a.rel = "noopener"; a.title = "Voir sur DofusDB";
        a.setAttribute("data-type", "custom-tag"); a.setAttribute("data-tag", type);
        a.append(...t.childNodes); t.replaceWith(a);
      }
    });
    // Positions écrites dans le texte ([x,y]) : clic = copie de la commande /travel.
    const marcheur = doc.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    const noeuds = [];
    while (marcheur.nextNode()) if (/\[\s*-?\d+\s*,\s*-?\d+\s*\]/.test(marcheur.currentNode.nodeValue)) noeuds.push(marcheur.currentNode);
    noeuds.forEach((nd) => {
      const frag = doc.createDocumentFragment();
      nd.nodeValue.split(/(\[\s*-?\d+\s*,\s*-?\d+\s*\])/).forEach((morceau, i) => {
        if (i % 2 === 0) { if (morceau) frag.append(morceau); return; }
        const [x, y] = morceau.match(/-?\d+/g);
        frag.append(boutonPos(x, y, morceau.replace(/\s/g, ""), doc));
      });
      nd.replaceWith(frag);
    });
    racine.querySelectorAll('input[type="checkbox"]').forEach((c, i) => {
      const k = cle ? cle(i) : String(i);
      c.className = "check";
      c.dataset.cle = k;
      if (coches[k]) c.setAttribute("checked", ""); else c.removeAttribute("checked");
      c.checked = !!coches[k];
      c.closest("li")?.classList.toggle("is-fait", c.checked);
    });
    return racine;
  }

  // Guides intégrés : liste (index.json) et contenu, chargés une seule fois.
  let index = null;
  const cache = {};
  const liste = () => (index ??= fetch("data/guides-detailles/index.json").then((r) => (r.ok ? r.json() : [])).then((l) => (Array.isArray(l) ? l : [])).catch(() => []));
  function charger(id) {
    return (cache[id] ??= liste().then((l) => {
      const g = l.find((x) => x.id === id);
      if (!g) throw new Error("guide inconnu");
      return fetch(g.fichier).then((r) => r.json()).then((d) => ({ ...g, ...d, id }));
    }).catch((err) => { delete cache[id]; throw err; }));
  }
  const charge = (id) => cache[id]?.valeur;
  function chargerEtNoter(id) { return charger(id).then((g) => { cache[id].valeur = g; return g; }); }

  window.GuideDetaille = { nettoyer, enrichir, boutonPos, liste, charger: chargerEtNoter, charge, STATUTS };
})();
