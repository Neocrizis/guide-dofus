// Fiche détaillée d'une quête : étapes, objectifs, positions et récompenses,
// chargées à la demande depuis les données du jeu (api.dofusdb.fr).
(() => {
  "use strict";

  const API = "https://api.dofusdb.fr";
  const DATA = window.QUETES || { liens: {}, quetes: {} };
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

  async function chargerQuete(id) {
    const q = await json(`${API}/quests/${id}`);
    const textes = q.steps.flatMap((s) => s.objectives.map((o) => o.text?.fr || ""));
    const trouve = (type) => textes.flatMap((t) => [...t.matchAll(new RegExp(`\\{${type},(\\d+)\\}`, "g"))].map((m) => +m[1]));
    const depart = q.startPosition?.[0];
    const objetsRecompense = q.steps.flatMap((s) => s.rewards.flatMap((r) => (r.itemsReward || []).map((it) => it[0])));
    const [pnj, monstres, objets, carte] = await Promise.all([
      noms("npcs", [...trouve("npc"), depart?.npcId || 0]),
      noms("monsters", trouve("monster")),
      noms("items", [...trouve("item"), ...objetsRecompense]),
      depart?.mapId ? json(`${API}/map-positions/${depart.mapId}`).catch(() => null) : null,
    ]);
    let zone = "";
    if (carte?.subAreaId) {
      const sa = await json(`${API}/subareas/${carte.subAreaId}`).catch(() => null);
      zone = sa?.name?.fr || "";
    }
    return { q, pnj, monstres, objets, carte, zone };
  }

  function remplacer(texte, d) {
    return echap(texte).replace(/\{(\w+),(\d+)[^}]*\}/g, (_, type, id) => {
      const nom = type === "npc" ? d.pnj[id] : type === "monster" ? d.monstres[id] : type === "item" ? d.objets[id] : null;
      return nom ? `<b>${echap(nom)}</b>` : "…";
    });
  }

  function rendreQuete(d, retour) {
    const { q } = d;
    const prerequis = (q.need?.quests || []).map((id) => DATA.quetes[id]?.[0] || null).filter(Boolean);
    const depart = q.startPosition?.[0];
    const pnjDepart = depart && d.pnj[depart.npcId];
    const etapes = q.steps.map((s, i) => {
      const objectifs = s.objectives.map((o) => {
        const pos = o.map ? [o.map.posX, o.map.posY] : o.coords ? [o.coords.x, o.coords.y] : null;
        return `<li><span>${remplacer(o.text?.fr || "", d)}</span>${pos ? coord(pos[0], pos[1]) : ""}</li>`;
      }).join("");
      const rec = s.rewards.flatMap((r) => [
        r.experienceRatio > 0 ? "Expérience" : null,
        r.kamasRatio > 0 ? "Kamas" : null,
        ...(r.itemsReward || []).map(([id, n]) => `${n > 1 ? n + " × " : ""}${echap(d.objets[id] || "Objet")}`),
        ...(r.titlesReward || []).length ? ["Titre"] : [],
        ...(r.emotesReward || []).length ? ["Émote"] : [],
        ...(r.spellsReward || []).length ? ["Sort"] : [],
      ]).filter(Boolean);
      return `<li class="qetape">
        <div class="qetape__tete"><span class="qetape__num">${i + 1}</span><b>${echap(s.name?.fr || "Étape")}</b></div>
        ${s.description?.fr ? `<p class="qetape__desc">${echap(s.description.fr)}</p>` : ""}
        ${objectifs ? `<ul class="qetape__obj">${objectifs}</ul>` : ""}
        ${rec.length ? `<div class="qetape__rec">Récompenses : ${[...new Set(rec)].join(", ")}</div>` : ""}
      </li>`;
    }).join("");
    corps.innerHTML = `
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
      <span class="section__label">Étapes</span>
      <ol class="qetapes">${etapes}</ol>
      <p class="quete__source">Données du jeu via DofusDB. Clique sur une position pour copier la commande /travel.</p>`;
  }

  function rendreListe(titre, ids) {
    corps.innerHTML = `
      <h2 class="quete__titre">${echap(titre)}</h2>
      <p class="dialog__hint">Ce succès regroupe ${ids.length} quête${ids.length > 1 ? "s" : ""}. Choisis-en une pour voir son détail.</p>
      <ul class="qliste">${ids.map((id) => {
        const [nom, niv] = DATA.quetes[id] || ["Quête " + id, "?"];
        return `<li><button type="button" class="qliste__btn" data-quete-id="${id}">
          <span>${echap(nom)}</span><span class="qliste__niv">Niv. ${niv}</span></button></li>`;
      }).join("")}</ul>`;
  }

  let liste = null; // { titre, ids } quand on vient d'un succès
  async function afficherQuete(id) {
    corps.innerHTML = `<p class="dialog__hint">Chargement de la quête…</p>`;
    try {
      rendreQuete(await chargerQuete(id), !!liste);
    } catch {
      corps.innerHTML = `<p class="dialog__hint">Impossible de charger cette quête pour le moment. Vérifie ta connexion et réessaie.</p>
        ${liste ? `<button type="button" class="btn btn--small" data-quete-retour>← Retour</button>` : ""}`;
    }
    corps.scrollTop = 0;
  }

  function ouvrir(texte) {
    const ids = idsPour(texte);
    if (!ids) return;
    if (!dialogue.open) dialogue.showModal();
    if (ids.length === 1) { liste = null; afficherQuete(ids[0]); }
    else { liste = { titre: texte.replace(/^[^:]+ : /, ""), ids }; rendreListe(liste.titre, ids); }
  }

  dialogue.addEventListener("click", (ev) => {
    const q = ev.target.closest("[data-quete-id]");
    if (q) { afficherQuete(+q.dataset.queteId); return; }
    if (ev.target.closest("[data-quete-retour]") && liste) { rendreListe(liste.titre, liste.ids); return; }
    if (ev.target.closest("#quete-fermer") || ev.target === dialogue) dialogue.close();
  });

  window.Quetes = { idsPour, ouvrir };
})();
