// Fiche détaillée d'une quête : étapes, objectifs, positions et récompenses,
// chargées à la demande depuis les données du jeu (api.dofusdb.fr).
(() => {
  "use strict";

  const API = "https://api.dofusdb.fr";
  const DATA = window.QUETES || { liens: {}, quetes: {} };
  // Noms des quêtes des pages Dofus, en plus de celles du guide.
  Object.entries(window.DOFUS?.quetes || {}).forEach(([id, v]) => { if (!DATA.quetes[id]) DATA.quetes[id] = v; });
  const DUFFUS = window.DUFFUS_QUETES || {};
  const dialogue = document.getElementById("quete-dialog");
  const corps = document.getElementById("quete-corps");
  const cache = new Map();

  const echap = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const coord = (x, y) => `<button type="button" class="coord" data-travel="/travel ${x},${y}" title="Copier /travel ${x},${y}">[${x},${y}]</button>`;

  // Le texte d'une case du guide peut être préfixé (« Série principale : … »).
  function idsPour(texte) {
    const t = String(texte).trim();
    if (DATA.liens[t]) return DATA.liens[t];
    const sansPrefixe = t.replace(/^[^:]+ : /, "");
    return DATA.liens[sansPrefixe] || null;
  }

  async function json(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
  }
  // Noms de PNJ, monstres et objets en un seul appel par type.
  async function noms(type, ids) {
    const liste = [...new Set(ids)].filter((x) => x > 0);
    const res = {};
    for (let i = 0; i < liste.length; i += 50) {
      const qs = liste.slice(i, i + 50).map((x) => `id[$in][]=${x}`).join("&");
      const r = await json(`${API}/${type}?${qs}&$limit=50&$select[]=id&$select[]=name`);
      r.data.forEach((o) => { res[o.id] = o.name?.fr; });
    }
    return res;
  }

  // Cartes citées dans les objectifs : nom et coordonnées.
  async function positions(ids) {
    const liste = [...new Set(ids)].filter((x) => x > 0);
    const res = {};
    for (let i = 0; i < liste.length; i += 50) {
      const qs = liste.slice(i, i + 50).map((x) => `id[$in][]=${x}`).join("&");
      const r = await json(`${API}/map-positions?${qs}&$limit=50`);
      r.data.forEach((m) => { res[m.id] = { nom: m.name?.fr || "", x: m.posX, y: m.posY }; });
    }
    return res;
  }

  async function chargerQuete(id) {
    const q = await json(`${API}/quests/${id}`);
    const textes = q.steps.flatMap((s) => s.objectives.map((o) => o.text?.fr || ""));
    const trouve = (type) => textes.flatMap((t) => [...t.matchAll(new RegExp(`\\{${type},(\\d+)(?:::[^}]*)?\\}`, "g"))].map((m) => +m[1]));
    const depart = q.startPosition?.[0];
    const objetsRecompense = q.steps.flatMap((s) => s.rewards.flatMap((r) => (r.itemsReward || []).map((it) => it[0])));
    const [pnj, monstres, objets, carte, alterations, zones, cartes] = await Promise.all([
      noms("npcs", [...trouve("npc"), depart?.npcId || 0]),
      noms("monsters", trouve("monster")),
      noms("items", [...trouve("item"), ...objetsRecompense]),
      depart?.mapId ? json(`${API}/map-positions/${depart.mapId}`).catch(() => null) : null,
      noms("alterations", trouve("alteration")).catch(() => ({})),
      noms("subareas", trouve("subarea")).catch(() => ({})),
      positions(trouve("map")).catch(() => ({})),
    ]);
    let zone = "";
    if (carte?.subAreaId) {
      const sa = await json(`${API}/subareas/${carte.subAreaId}`).catch(() => null);
      zone = sa?.name?.fr || "";
    }
    return { q, pnj, monstres, objets, carte, zone, alterations, zones, cartes };
  }

  function remplacer(texte, d) {
    return echap(texte).replace(/\{(\w+),(\d+)(?:::([^}]*))?\}/g, (_, type, id, libelle) => {
      if (type === "map") {
        const c = d.cartes?.[id];
        const nom = libelle || c?.nom;
        return `${nom ? `<b>${nom}</b>` : "la carte"}${c ? " " + coord(c.x, c.y) : ""}`;
      }
      const nom = type === "npc" ? d.pnj[id] : type === "monster" ? d.monstres[id] : type === "item" ? d.objets[id]
        : type === "alteration" ? d.alterations?.[id] : type === "subarea" ? d.zones?.[id] : null;
      return nom ? `<b>${echap(nom)}</b>` : libelle || "…";
    });
  }

  function rendreQuete(vue, d) {
    const retour = !!vue.liste;
    const { q } = d;
    const prerequis = (q.need?.quests || []).map((id) => DATA.quetes[id]?.[0] || null).filter(Boolean);
    const depart = q.startPosition?.[0];
    const pnjDepart = depart && d.pnj[depart.npcId];
    const etapesFaites = window.GuideDofus?.etat().qetapes?.[q.id] || {};
    const enCours = q.steps.findIndex((_, i) => !etapesFaites[i]);
    const etapes = q.steps.map((s, i) => {
      const objectifs = s.objectives.map((o) => {
        const pos = o.map ? [o.map.posX, o.map.posY] : o.coords ? [o.coords.x, o.coords.y] : null;
        const txt = remplacer(nettoyer(o.text?.fr || ""), d).trim();
        if (!txt) return "";
        const dejaCarte = /\{map,\d+/.test(o.text?.fr || "");
        return `<li><span>${txt}${pos && !dejaCarte ? " " + coord(pos[0], pos[1]) : ""}</span></li>`;
      }).join("");
      const rec = s.rewards.flatMap((r) => [
        r.experienceRatio > 0 ? "Expérience" : null,
        r.kamasRatio > 0 ? "Kamas" : null,
        ...(r.itemsReward || []).map(([id, n]) => `${n > 1 ? n + " × " : ""}${echap(d.objets[id] || "Objet")}`),
        ...(r.titlesReward || []).length ? ["Titre"] : [],
        ...(r.emotesReward || []).length ? ["Émote"] : [],
        ...(r.spellsReward || []).length ? ["Sort"] : [],
      ]).filter(Boolean);
      const ok = !!etapesFaites[i];
      return `<li class="qetape${ok ? " qetape--faite" : ""}${i === enCours ? " qetape--courante" : ""}">
        <div class="qetape__tete"${window.GuideDofus ? ` data-qetape="${q.id}|${i}" role="button" tabindex="0" aria-pressed="${ok}" title="Cliquer pour griser / dégriser l'étape"` : ""}><span class="qetape__num">${ok ? "✓" : i + 1}</span><b>${echap(s.name?.fr || "Étape")}</b></div>
        ${s.description?.fr ? `<p class="qetape__desc">${echap(nettoyer(s.description.fr))}</p>` : ""}
        ${objectifs ? `<ul class="qetape__obj">${objectifs}</ul>` : ""}
        ${rec.length ? `<div class="qetape__rec">Récompenses : ${[...new Set(rec)].join(", ")}</div>` : ""}
      </li>`;
    }).join("");
    vue.el.innerHTML = `
      ${vue.haut || ""}
      ${retour ? `<button type="button" class="btn btn--ghost btn--small" data-quete-retour>← Retour à la liste</button>` : ""}
      <h2 class="quete__titre">${echap(q.name?.fr)}</h2>
      <div class="quete__infos">
        <span class="pill pill--accent">Niveau ${q.levelMin}</span>
        ${q.isPartyQuest ? `<span class="pill">Quête de groupe</span>` : ""}
        ${q.isDungeonQuest ? `<span class="pill">Quête de donjon</span>` : ""}
        ${q.repeatType ? `<span class="pill">Répétable</span>` : ""}
      </div>
      ${pnjDepart || d.carte ? `<div class="quete__depart">
        <span class="section__label">Départ</span>
        <p>${pnjDepart ? `Parler à <b>${echap(pnjDepart)}</b>` : "Lancement"}${d.carte?.name?.fr ? ` · ${echap(d.carte.name.fr)}` : ""}${d.zone ? ` · ${echap(d.zone)}` : ""}
        ${d.carte ? coord(d.carte.posX, d.carte.posY) : ""}</p>
      </div>` : ""}
      ${prerequis.length ? `<div class="quete__depart"><span class="section__label">Prérequis</span><p>${prerequis.map(echap).join(", ")}</p></div>` : ""}
      <span class="section__label">Étapes${window.GuideDofus ? ` <small class="qetapes__aide">clique sur une étape pour la griser</small>` : ""}</span>
      <ol class="qetapes">${etapes}</ol>
      ${liens(q)}
      <p class="quete__source">Clique sur une position pour copier la commande /travel.</p>`;
  }

  // Soluces externes et case « quête terminée » (enregistrée pour le personnage actif).
  function liens(q) {
    const nom = q.name?.fr || "";
    const faite = !!window.GuideDofus?.etat().quetes?.[q.id];
    return `<div class="quete__liens">
      ${window.GuideDofus ? `<button type="button" class="btn btn--small ${faite ? "btn--accent" : ""}" data-quete-fait="${q.id}" aria-pressed="${faite}">${faite ? "✓ Quête terminée" : "Marquer comme terminée"}</button>` : ""}
      <a class="btn btn--small btn--ghost" href="https://www.dofuspourlesnoobs.com/apps/search?q=${encodeURIComponent(nom)}" target="_blank" rel="noopener">Soluce DPLN ↗</a>
      <a class="btn btn--small btn--ghost" href="https://dofusdb.fr/fr/database/quest/${q.id}" target="_blank" rel="noopener">DofusDB ↗</a>
    </div>`;
  }

  // Textes du jeu : « {{ui,…::mini-carte}} » → « mini-carte », balises HTML retirées.
  function nettoyer(t) {
    return String(t).replace(/\{\{[^{}]*?::([^{}]*?)\}\}/g, "$1").replace(/\{\{[^{}]*\}\}/g, "").replace(/<[^>]+>/g, "").replace(/\s{2,}/g, " ").trim();
  }

  function rendreListe(vue) {
    const { titre, ids } = vue.liste;
    const G = window.GuideDofus;
    const faites = G?.etat().quetes || {};
    vue.el.innerHTML = `
      ${vue.haut || ""}
      <h2 class="quete__titre">${echap(titre)}</h2>
      <p class="dialog__hint">Ce succès regroupe ${ids.length} quête${ids.length > 1 ? "s" : ""}. Choisis-en une pour voir son détail.</p>
      <ul class="qliste">${ids.map((id) => {
        const [nom, niv] = DATA.quetes[id] || ["Quête " + id, "?"];
        const ok = !!faites[id];
        return `<li><button type="button" class="qliste__btn${ok ? " qliste__btn--ok" : ""}" data-quete-id="${id}">
          <span>${ok ? "✓ " : ""}${echap(nom)}</span><span class="qliste__niv">Niv. ${niv}</span></button></li>`;
      }).join("")}</ul>`;
  }

  async function afficherQuete(vue, id) {
    vue.el.innerHTML = `${vue.haut || ""}<p class="dialog__hint">Chargement de la quête…</p>`;
    try {
      const d = await chargerQuete(id);
      if (vue.el.isConnected) rendreQuete(vue, d);
    } catch {
      vue.el.innerHTML = `${vue.haut || ""}<p class="dialog__hint">Impossible de charger cette quête pour le moment. Vérifie ta connexion et réessaie.</p>
        ${vue.liste ? `<button type="button" class="btn btn--small" data-quete-retour>← Retour à la liste</button>` : ""}`;
    }
    vue.el.scrollTop = 0;
  }

  // Affiche une quête (ou la liste des quêtes d'un succès) dans un conteneur :
  // la fenêtre de la page, ou la carte de l'overlay.
  function montrer(vue, texte) {
    const ids = idsPour(texte);
    if (!ids) return false;
    if (ids.length === 1) { vue.liste = null; afficherQuete(vue, ids[0]); }
    else { vue.liste = { titre: texte.replace(/^[^:]+ : /, ""), ids }; rendreListe(vue); }
    return true;
  }
  // Étape de quête cliquée : grisée (ou dégrisée), l'étape suivante passe en évidence. La quête ne se valide qu'avec « Marquer comme terminée ».
  function cocherEtape(vue, c) {
    const G = window.GuideDofus;
    const [qid, i] = c.dataset.qetape.split("|").map(Number);
    const etat = G.etat();
    const faites = ((etat.qetapes ??= {})[qid] ??= {});
    const oui = !faites[i];
    if (oui) faites[i] = 1; else delete faites[i];
    if (!Object.keys(faites).length) delete etat.qetapes[qid];
    const items = [...vue.el.querySelectorAll(".qetape")];
    items.forEach((li, j) => {
      li.classList.toggle("qetape--faite", !!faites[j]);
      const t = li.querySelector("[data-qetape]");
      t?.setAttribute("aria-pressed", !!faites[j]);
      const n = li.querySelector(".qetape__num"); if (n) n.textContent = faites[j] ? "✓" : j + 1;
    });
    const enCours = items.findIndex((_, j) => !faites[j]);
    items.forEach((li, j) => li.classList.toggle("qetape--courante", j === enCours));
    G.sauver();
    if (enCours > 0 && oui) items[enCours].scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // Clics à l'intérieur d'une vue (choix d'une quête, retour à la liste).
  function gererClic(vue, ev) {
    const q = ev.target.closest("[data-quete-id]");
    if (q) { afficherQuete(vue, +q.dataset.queteId); return true; }
    const caseEtape = ev.target.closest("[data-qetape]");
    if (caseEtape && window.GuideDofus) { cocherEtape(vue, caseEtape); return true; }
    const fait = ev.target.closest("[data-quete-fait]");
    if (fait && window.GuideDofus) {
      const id = +fait.dataset.queteFait;
      const oui = !window.GuideDofus.etat().quetes?.[id];
      window.Pages?.marquer(id, oui);
      fait.classList.toggle("btn--accent", oui);
      fait.setAttribute("aria-pressed", oui);
      fait.textContent = oui ? "✓ Quête terminée" : "Marquer comme terminée";
      // Appli : une quête validée ramène directement à la liste (ou à l'étape).
      if (oui && vue.apresFait) { if (vue.liste) rendreListe(vue); else vue.apresFait(); }
      return true;
    }
    if (ev.target.closest("[data-quete-retour]") && vue.liste) { rendreListe(vue); return true; }
    return false;
  }

  const vuePage = { el: corps, liste: null };
  function ouvrir(texte) {
    if (!idsPour(texte)) return;
    if (!dialogue.open) dialogue.showModal();
    montrer(vuePage, texte);
  }
  dialogue.addEventListener("click", (ev) => {
    if (gererClic(vuePage, ev)) return;
    if (ev.target.closest("#quete-fermer") || ev.target === dialogue) dialogue.close();
  });

  function ouvrirId(id) {
    if (!dialogue.open) dialogue.showModal();
    vuePage.liste = null;
    afficherQuete(vuePage, id);
  }

  window.Quetes = { idsPour, ouvrir, ouvrirId, montrer, gererClic };
})();
