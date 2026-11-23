// Pages « Dofus », « Almanax » et « Encyclopédie ».
// Données du jeu : data/dofus.js (préparé depuis DofusDB) et api.dofusdb.fr en direct.
(() => {
  "use strict";

  const API = "https://api.dofusdb.fr";
  const SITE = "https://dofusdb.fr/fr/database";
  const D = window.DOFUS || { dofus: [], quetes: {}, donjons: {} };
  const $ = (s) => document.querySelector(s);
  const echap = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = () => window.GuideDofus;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const cache = new Map();
  function json(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
    return p;
  }
  const nomQuete = (id) => D.quetes[id]?.[0] || window.QUETES?.quetes?.[id]?.[0] || `Quête ${id}`;
  const nivQuete = (id) => D.quetes[id]?.[1] ?? window.QUETES?.quetes?.[id]?.[1] ?? "?";

  // ---------- Quêtes terminées (par personnage) ----------
  // Quêtes cochées ici + celles déjà validées dans le guide de progression.
  const duGuide = () => app()?.quetesGuide?.() || {};
  const faites = () => ({ ...duGuide(), ...(app()?.etat().quetes || {}) });
  function marquer(id, fait) {
    const e = app().etat();
    e.quetes = e.quetes || {};
    if (fait) e.quetes[id] = 1; else delete e.quetes[id];
    if (fait) app().noter(nomQuete(id), "Quête terminée");
    app().sauver();
    rendre();
  }
  function bilanDofus(d, f = faites()) {
    const ids = d.quetes;
    const ok = ids.filter((id) => f[id]).length;
    const pre = d.prerequis.filter((id) => f[id]).length;
    return { ok, total: ids.length, pre, preTotal: d.prerequis.length, p: pct(ok, ids.length) };
  }

  // Icônes des Dofus, chargées une fois.
  let icones = null;
  function chargerIcones() {
    if (icones) return icones;
    const qs = D.dofus.map((d) => `id[$in][]=${d.id}`).join("&");
    icones = json(`${API}/items?${qs}&$limit=50&$select[]=id&$select[]=img&$select[]=iconId`)
      .then((r) => Object.fromEntries(r.data.map((o) => [o.id, o.img])))
      .catch(() => ({}));
    icones.then((r) => { iconesPretes = r; rendre(); });
    return icones;
  }
  let iconesPretes = {};

  // Image de fond au survol : la salle du boss du donjon phare de chaque Dofus (cartes rendues par DofusDB),
  // ou le lieu de départ de la quête quand le Dofus n'a pas de donjon.
  const FONDS = {7113:192413696,19629:152834048,972:116654595,17078:157289472,737:155718656,16061:136840192,15235:132909056,694:136578048,23237:208408576,23408:210243584,739:62915584,7754:104333827,7043:112203523,7112:211550208,18043:169873408,7115:160564224,7114:187437056,8698:129500160,6980:239601156,19398:187957512,20286:184689921,26066:220467200,29136:220729857,31794:236454912,10907:76288008,13344:101450251};
  const fond = (id) => FONDS[id] ? `--fond:url('${API}/img/maps/0.5/${FONDS[id]}.jpg')` : "";
  // ---------- Page Dofus ----------
  let filtreDofus = "";
  function rendreListeDofus(el) {
    const f = faites();
    const q = filtreDofus.toLowerCase();
    const liste = D.dofus.filter((d) => !q || d.nom.toLowerCase().includes(q));
    const total = D.dofus.reduce((a, d) => a + (bilanDofus(d, f).p === 100 ? 1 : 0), 0);
    el.innerHTML = `
      <section class="hero">
        <p class="hero__kicker">Quêtes des Dofus</p>
        <h1>Dofus</h1>
        <p class="hero__sub">Les quêtes à faire pour chaque Dofus, leurs prérequis et les donjons à passer. Les quêtes validées dans le guide sont cochées automatiquement, et tu peux cocher les autres ici.</p>
      </section>
      <div class="pages-barre card">
        <input class="input" type="search" data-page-filtre placeholder="Rechercher un Dofus…" value="${echap(filtreDofus)}">
        <span class="pages-barre__info"><b>${total}</b> / ${D.dofus.length} Dofus terminés</span>
      </div>
      <ul class="dofus-grille">${liste.map((d) => {
        const b = bilanDofus(d, f);
        const img = iconesPretes[d.id];
        return `<li><a class="dofus-carte card ${b.p === 100 ? "is-fini" : ""}" href="#dofus/${d.id}" style="${fond(d.id)}">
          <span class="dofus-carte__img">${img ? `<img src="${echap(img)}" alt="" loading="lazy">` : ""}</span>
          <span class="dofus-carte__txt">
            <b>${echap(d.nom)}</b>
            <small>Niveau ${d.niveau} · ${b.total} quête${b.total > 1 ? "s" : ""}${d.donjons.length ? ` · ${d.donjons.length} donjon${d.donjons.length > 1 ? "s" : ""}` : ""}</small>
            <span class="bar"><span class="bar__fill" style="width:${b.p}%"></span></span>
          </span>
          <span class="dofus-carte__pct">${b.p} %</span>
        </a></li>`;
      }).join("") || `<li class="dash__vide">Aucun Dofus ne correspond.</li>`}</ul>`;
  }

  function ligneQuete(id, f, g) {
    const fait = !!f[id];
    const viaGuide = fait && g[id] && !app()?.etat().quetes?.[id];
    return `<li class="qcoche ${fait ? "is-fait" : ""}">
      <label ${viaGuide ? `title="Validée dans le guide : décoche-la dans le guide pour la retirer"` : ""}><input type="checkbox" class="check" data-quete-coche="${id}" ${fait ? "checked" : ""} ${viaGuide ? "disabled" : ""}>
        <span class="qcoche__nom">${echap(nomQuete(id))}</span>${viaGuide ? ` <span class="pill qcoche__guide">Guide</span>` : ""}</label>
      <span class="qcoche__niv">Niv. ${echap(nivQuete(id))}</span>
      <button type="button" class="btn btn--small btn--ghost" data-quete-ouvrir="${id}">Détail</button>
    </li>`;
  }

  function rendreDetailDofus(el, id) {
    const d = D.dofus.find((x) => x.id === id);
    if (!d) { location.hash = "dofus"; return; }
    const g = duGuide();
    const f = faites();
    const b = bilanDofus(d, f);
    const img = iconesPretes[d.id];
    const restants = d.prerequis.filter((q) => !f[q]);
    el.innerHTML = `
      <div class="dofus-detail">
        <a class="btn btn--ghost btn--small" href="#dofus">← Tous les Dofus</a>
        <div class="card dofus-entete" style="${fond(d.id)}">
          <span class="dofus-carte__img dofus-carte__img--grand">${img ? `<img src="${echap(img)}" alt="">` : ""}</span>
          <div class="dofus-entete__txt">
            <p class="hero__kicker">Niveau ${d.niveau}${d.succes ? ` · Succès « ${echap(d.succes)} »` : ""}</p>
            <h1>${echap(d.nom)}</h1>
            <div class="dash-barre">
              <div class="dash-barre__haut"><span>Quêtes terminées</span><b>${b.ok} / ${b.total}</b></div>
              <div class="bar"><div class="bar__fill" style="width:${b.p}%"></div></div>
            </div>
          </div>
          <div class="dofus-entete__actions">
            ${b.ok < b.total || d.quetes.some((q) => app()?.etat().quetes?.[q]) ? `<button type="button" class="btn btn--small" data-dofus-tout="${d.id}">${b.ok === b.total ? "Tout décocher" : "Tout cocher"}</button>` : ""}
          </div>
        </div>
        ${d.prerequis.length ? `<section class="card dofus-bloc">
          <div class="dash__label">Prérequis · ${b.pre} / ${b.preTotal}</div>
          <p class="dialog__hint">Quêtes à terminer avant de pouvoir lancer celles du Dofus.${restants.length ? ` Il en reste ${restants.length}.` : " Tout est bon !"}</p>
          <ul class="qcoches">${d.prerequis.map((q) => ligneQuete(q, f, g)).join("")}</ul>
        </section>` : ""}
        <section class="card dofus-bloc">
          <div class="dash__label">Quêtes du Dofus · ${b.ok} / ${b.total}</div>
          <ul class="qcoches">${d.quetes.map((q) => ligneQuete(q, f, g)).join("")}</ul>
        </section>
        ${d.donjons.length ? `<section class="card dofus-bloc">
          <div class="dash__label">Donjons à passer · ${d.donjons.length}</div>
          <ul class="donjons">${d.donjons.map((dj) => {
            const [nom, niv] = D.donjons[dj] || [`Donjon ${dj}`, "?"];
            return `<li><a href="${SITE}/dungeon/${dj}" target="_blank" rel="noopener"><span>${echap(nom)}</span><small>Niv. ${niv}</small></a></li>`;
          }).join("")}</ul>
        </section>` : ""}
      </div>`;
  }

  // ---------- Almanax ----------
  const JOURS = 7;
  let almanax = null;
  const dateISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  // « {{monsterRace,175::Brûlâmes}} » -> « Brûlâmes » ; on garde seulement le gras.
  const bonus = (s) => echap(String(s || "").replace(/\{\{[^}]*::([^}]*)\}\}/g, "$1").replace(/\{\{[^}]*\}\}/g, ""))
    .replace(/&lt;(\/?)b&gt;/g, "<$1b>");
  function chargerAlmanax() {
    if (almanax) return almanax;
    const jours = Array.from({ length: JOURS }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
    almanax = Promise.all(jours.map(async (d) => {
      try {
        const a = await json(`${API}/almanax?date=${dateISO(d)}`);
        const item = a.itemIds?.[0] ? await json(`${API}/items/${a.itemIds[0]}`).catch(() => null) : null;
        return { d, a, item };
      } catch { return { d, a: null }; }
    })).then((r) => { almanaxPret = r; rendre(); return r; });
    almanax.catch(() => { almanax = null; });
    return almanax;
  }
  let almanaxPret = null;
  function rendreAlmanax(el) {
    if (!almanaxPret) chargerAlmanax();
    const jour = (d) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    el.innerHTML = `
      <section class="hero">
        <p class="hero__kicker">Calendrier</p>
        <h1>Almanax</h1>
        <p class="hero__sub">L'offrande du jour et celles des prochains jours, avec le bonus actif.</p>
      </section>
      <div class="almanax">${!almanaxPret ? `<p class="dash__vide">Chargement de l'Almanax…</p>` : almanaxPret.map(({ d, a, item }, i) => !a
        ? `<div class="card almanax__jour"><b>${jour(d)}</b><p class="dash__vide">Indisponible pour le moment.</p></div>`
        : `<article class="card almanax__jour ${i === 0 ? "is-aujourdhui" : ""}">
          <div class="almanax__date">${i === 0 ? "Aujourd'hui · " : ""}${jour(d)}</div>
          <div class="almanax__offrande">
            ${item?.img ? `<img src="${echap(item.img)}" alt="" loading="lazy">` : ""}
            <div><span class="almanax__qte">${a.quantities?.[0] || 1} ×</span>
              ${item ? `<a href="${SITE}/item/${item.id}" target="_blank" rel="noopener">${echap(item.name?.fr || "Objet")}</a>` : "Offrande"}</div>
          </div>
          <div class="almanax__bonus"><b>${echap(a.name?.fr || a.name || "Bonus")}</b><p>${bonus(a.desc?.fr ?? a.desc)}</p></div>
          ${a.npc?.name ? `<div class="almanax__pnj">Méryde : ${echap(a.npc.name.fr || a.npc.name)}</div>` : ""}
        </article>`).join("")}</div>
      <p class="archis-source">Les offrandes se déposent au temple de l'Almanax [-4,-24].</p>`;
  }

  // ---------- Encyclopédie ----------
  const TYPES = {
    quests: { nom: "Quêtes", sel: ["id", "name", "levelMin"], niv: (o) => o.levelMin, lien: "quest" },
    dungeons: { nom: "Donjons", sel: ["id", "name", "optimalPlayerLevel"], niv: (o) => o.optimalPlayerLevel, lien: "dungeon" },
    monsters: { nom: "Monstres", sel: ["id", "name", "img", "gfxId"], niv: () => null, lien: "monster" },
    items: { nom: "Objets", sel: ["id", "name", "level", "img", "iconId"], niv: (o) => o.level, lien: "item" },
  };
  const enc = { type: "quests", q: "", res: null, charge: false, n: 0 };
  const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").toLowerCase().replace(/['’]/g, "").trim();
  let minuteur;
  function chercher() {
    const q = slug(enc.q);
    const n = ++enc.n;
    if (q.length < 2) { enc.res = null; enc.charge = false; rendre(); return; }
    enc.charge = true;
    const t = TYPES[enc.type];
    const url = `${API}/${enc.type}?slug.fr[$search]=${encodeURIComponent(q)}&$limit=30&${t.sel.map((s) => `$select[]=${s}`).join("&")}`;
    json(url).then((r) => { if (n === enc.n) { enc.res = r; enc.charge = false; rendre(); } })
      .catch(() => { if (n === enc.n) { enc.res = { data: [], erreur: true }; enc.charge = false; rendre(); } });
  }
  function rendreEncyclo(el) {
    const actif = document.activeElement?.matches?.("[data-enc-q]");
    const t = TYPES[enc.type];
    const res = enc.res?.data || [];
    el.innerHTML = `
      <section class="hero">
        <p class="hero__kicker">Base de données</p>
        <h1>Encyclopédie</h1>
        <p class="hero__sub">Cherche une quête, un donjon, un monstre ou un objet. Les quêtes s'ouvrent avec leur fiche détaillée.</p>
      </section>
      <div class="pages-barre card">
        <div class="tabs enc-types">${Object.entries(TYPES).map(([k, v]) =>
          `<button type="button" class="tab ${k === enc.type ? "is-active" : ""}" data-enc-type="${k}">${v.nom}</button>`).join("")}</div>
        <input class="input" type="search" data-enc-q placeholder="Rechercher dans les ${t.nom.toLowerCase()}…" value="${echap(enc.q)}">
      </div>
      <div class="enc-res">${enc.charge && !enc.res ? `<p class="dash__vide">Recherche…</p>`
        : !enc.res ? `<p class="dash__vide">Tape au moins deux lettres pour lancer la recherche.</p>`
        : enc.res.erreur ? `<p class="dash__vide">La recherche n'a pas abouti. Vérifie ta connexion et réessaie.</p>`
        : !res.length ? `<p class="dash__vide">Aucun résultat.</p>`
        : `<p class="pages-barre__info">${enc.res.total > res.length ? `${res.length} premiers résultats sur ${enc.res.total}` : `${res.length} résultat${res.length > 1 ? "s" : ""}`}</p>
          <ul class="enc-liste">${res.map((o) => {
            const niv = t.niv(o);
            const nom = echap(o.name?.fr || "Sans nom");
            const src = o.img || "";
            const img = src ? `<img src="${echap(src)}" alt="" loading="lazy">` : "";
            const contenu = `${img ? `<span class="enc-img">${img}</span>` : ""}<span class="enc-nom">${nom}</span>${niv != null ? `<small>Niv. ${niv}</small>` : ""}`;
            return enc.type === "quests"
              ? `<li><button type="button" class="enc-item" data-quete-ouvrir="${o.id}">${contenu}</button></li>`
              : `<li><a class="enc-item" href="${SITE}/${t.lien}/${o.id}" target="_blank" rel="noopener">${contenu}<span class="enc-ext">↗</span></a></li>`;
          }).join("")}</ul>`}</div>`;
    if (actif) { const i = el.querySelector("[data-enc-q]"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  // ---------- Routage ----------
  let vue = null;
  function afficher(nom, param) {
    vue = { nom, param };
    if (nom === "dofus") chargerIcones();
    rendre();
    window.scrollTo(0, 0);
  }
  function cacher() { vue = null; }
  function rendre() {
    const el = $("#vue-pages");
    if (!el || !vue || el.hidden) return;
    if (vue.nom === "dofus") vue.param ? rendreDetailDofus(el, +vue.param) : rendreListeDofus(el);
    else if (vue.nom === "almanax") rendreAlmanax(el);
    else if (vue.nom === "encyclopedie") rendreEncyclo(el);
  }

  document.addEventListener("click", (ev) => {
    const t = ev.target;
    const ouvrir = t.closest("[data-quete-ouvrir]");
    if (ouvrir) { ev.preventDefault(); window.Quetes?.ouvrirId(+ouvrir.dataset.queteOuvrir); return; }
    const type = t.closest("[data-enc-type]");
    if (type) { enc.type = type.dataset.encType; enc.res = null; chercher(); rendre(); return; }
    const tout = t.closest("[data-dofus-tout]");
    if (tout) {
      const d = D.dofus.find((x) => x.id === +tout.dataset.dofusTout);
      const e = app().etat();
      e.quetes = e.quetes || {};
      const f = faites();
      const cocher = d.quetes.some((id) => !f[id]);
      d.quetes.forEach((id) => { if (cocher) e.quetes[id] = 1; else delete e.quetes[id]; });
      if (cocher) app().noter(d.nom, "Quêtes du Dofus terminées");
      app().sauver();
      rendre();
    }
  });
  document.addEventListener("change", (ev) => {
    const c = ev.target.closest?.("[data-quete-coche]");
    if (c) marquer(+c.dataset.queteCoche, c.checked);
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.matches?.("[data-page-filtre]")) {
      filtreDofus = ev.target.value;
      const pos = ev.target.selectionStart;
      rendre();
      const i = document.querySelector("[data-page-filtre]");
      if (i) { i.focus(); i.setSelectionRange(pos, pos); }
    }
    if (ev.target.matches?.("[data-enc-q]")) {
      enc.q = ev.target.value;
      clearTimeout(minuteur);
      minuteur = setTimeout(chercher, 250);
    }
  });

  window.Pages = { afficher, cacher, rendre, marquer, faites: () => faites(), bilanDofus, DOFUS: D };
})();
