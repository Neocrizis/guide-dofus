(() => {
  "use strict";

  const GUIDES = window.GUIDES;
  const CLE_ANCIENNE = "guide-dofus:progression"; // une seule progression (avant les personnages)
  const CLE = "guide-dofus:personnages";

  // ---------- Personnages sauvegardés dans le navigateur ----------
  // Chaque personnage a son nom, sa classe et sa propre progression.
  // Les identifiants d'étapes sont uniques entre les guides (e…, g…, a…),
  // donc « faites » et « succes » sont communs ; seule l'étape en cours dépend du guide.
  const nouvelId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function nouveauPerso(nom, classe = "", base = {}) {
    return Object.assign(
      { id: nouvelId(), nom, classe, niveau: "", faites: {}, succes: {}, courante: GUIDES[0].etapes[0].id, courantes: {}, guide: GUIDES[0].id },
      base, { nom: base.nom || nom }
    );
  }
  function lireJSON(cle) {
    try { return JSON.parse(localStorage.getItem(cle)); } catch { return null; }
  }
  const compte = lireJSON(CLE) || (() => {
    const ancien = lireJSON(CLE_ANCIENNE);
    const p = nouveauPerso("Mon personnage", ancien?.classe || "", ancien || {});
    return { persos: [p], actif: p.id };
  })();
  if (!compte.persos?.length) { const p = nouveauPerso("Mon personnage"); compte.persos = [p]; compte.actif = p.id; }
  let etat = compte.persos.find((p) => p.id === compte.actif) || compte.persos[0];
  let G = GUIDES.find((g) => g.id === etat.guide) || GUIDES[0];
  let etapes = G.etapes;
  function sauver() {
    compte.actif = etat.id;
    etat.maj = Date.now();
    try { localStorage.setItem(CLE, JSON.stringify(compte)); } catch { /* stockage indisponible */ }
    window.dispatchEvent(new CustomEvent("guide:sauve")); // synchronisation en ligne (js/compte.js)
  }

  const index = (id) => etapes.findIndex((e) => e.id === id);
  const courante = () => etapes[Math.max(0, index(etat.courante))];

  // ---------- Petits utilitaires ----------
  const echap = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Rend les positions [x,y] cliquables : un clic copie la commande /travel.
  const texte = (s) => echap(s).replace(/\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/g,
    (_, x, y) => `<button type="button" class="coord" data-travel="/travel ${x},${y}" title="Copier /travel ${x},${y}">[${x},${y}]</button>`);
  const paragraphes = (liste) => liste.map((t) => `<p>${texte(t)}</p>`).join("");

  function section(label, contenu, classe = "") {
    return contenu ? `<div class="section ${classe}"><div class="section__label">${label}</div>${contenu}</div>` : "";
  }
  function tags(liste) {
    return liste && liste.length ? `<div class="tags">${liste.map((t) => `<span class="pill">${texte(t)}</span>`).join("")}</div>` : "";
  }
  function listeSucces(e) {
    if (!e.succes.length) return "";
    return `<ul class="list">${e.succes.map((s, i) => {
      const k = `${e.id}|${i}`;
      return `<li><label><input type="checkbox" class="check" data-succes="${k}" ${etat.succes[k] ? "checked" : ""}><span>${texte(s)}</span></label></li>`;
    }).join("")}</ul>`;
  }
  function contenuEtape(e, compact) {
    const conseilClasse = etat.classe && e.classes && e.classes[etat.classe];
    const donjons = [
      ...(e.tourDuMonde || []).map((d) => `Tour du Monde : ${d}`),
      ...(e.tornade || []).map((d) => `Tornade : ${d}`),
      ...(e.donjons || []),
    ];
    return [
      section("Succès et quêtes", listeSucces(e)),
      section("À faire", paragraphes(e.details)),
      section("Conseils", paragraphes(e.infos), "tips"),
      section("Donjons", tags(donjons)),
      section("Sorts communs", e.sorts ? paragraphes(e.sorts) : ""),
      section(`Conseils ${etat.classe}`, conseilClasse ? paragraphes(conseilClasse) : "", "tips"),
      compact ? "" : section("Équipements", e.equipements ? paragraphes(e.equipements) : ""),
      compact ? "" : section("Idoles", e.idoles ? paragraphes(e.idoles) : ""),
    ].join("");
  }

  // ---------- Page principale ----------
  const $ = (s) => document.querySelector(s);
  let groupes = [];
  const nomGroupe = (n) => (n === "" ? G.titre : n === "0" ? "Préambule" : /^\d+$/.test(n) ? `Niveau ${n}` : `Niveaux ${n}`);
  const ouvertes = new Set([etat.courante]);

  // Prépare la page pour le guide choisi (onglets en haut).
  function chargerGuide(id) {
    etat.courantes[G.id] = etat.courante;
    G = GUIDES.find((g) => g.id === id) || GUIDES[0];
    etapes = G.etapes;
    etat.guide = G.id;
    etat.courante = etat.courantes[G.id] && index(etat.courantes[G.id]) >= 0 ? etat.courantes[G.id] : etapes[0].id;
    ouvertes.add(etat.courante);
    groupes = [];
    etapes.forEach((e) => {
      const g = groupes[groupes.length - 1];
      if (g && g.niveau === e.niveau) g.etapes.push(e);
      else groupes.push({ niveau: e.niveau, etapes: [e] });
    });
    const niveaux = etapes.map((e) => e.niveau).filter((n) => /\d/.test(n));
    $("#niveau-guide").textContent = G.id === "progression" ? "1 à 200" : niveaux.length ? niveaux[0] : "—";
    $("#niveau-stat").hidden = G.id !== "progression";
    $("#titre-guide").textContent = G.titre;
    $("#sous-titre").textContent = `${G.description} Par ${G.auteur} · version du jeu ${G.version} · ${etapes.length} étapes.`;
    $("#nb-total").textContent = etapes.length;
    $("#guides").innerHTML = GUIDES.map((g) =>
      `<button type="button" class="tab ${g.id === G.id ? "is-active" : ""}" data-guide="${g.id}">${echap(g.titre)}</button>`).join("");
    $("#recherche").value = "";
  }

  GUIDES[0].classes.forEach((c) => $("#classe").insertAdjacentHTML("beforeend", `<option>${echap(c)}</option>`));
  $("#classe").value = etat.classe;

  function rendrePage() {
    const q = $("#recherche").value.trim().toLowerCase();
    const correspond = (e) => !q || JSON.stringify(e).toLowerCase().includes(q);
    let html = "";
    groupes.forEach((g, gi) => {
      const visibles = g.etapes.filter(correspond);
      if (!visibles.length) return;
      const faites = g.etapes.filter((e) => etat.faites[e.id]).length;
      html += `<section class="group card" id="g${gi}">
        <div class="group__head">
          <span class="group__badge">${gi + 1}</span>
          <h2 class="group__title">${echap(nomGroupe(g.niveau))}</h2>
          <span class="group__pct">${Math.round((faites / g.etapes.length) * 100)} %</span>
        </div>
        <div class="group__list">${visibles.map(rendreEtape).join("")}</div>
      </section>`;
    });
    $("#etapes").innerHTML = html || `<div class="empty card">Aucune étape ne correspond à « ${echap(q)} ».</div>`;

    $("#chapitres").innerHTML = groupes.map((g, gi) => {
      const faites = g.etapes.filter((e) => etat.faites[e.id]).length;
      return `<a class="chapter ${faites === g.etapes.length ? "is-done" : ""}" href="#g${gi}">
        <span>${echap(nomGroupe(g.niveau))}</span><span class="chapter__count">${faites}/${g.etapes.length}</span></a>`;
    }).join("");

    const total = etapes.filter((e) => etat.faites[e.id]).length;
    const pct = Math.round((total / etapes.length) * 100);
    $("#nb-faites").textContent = total;
    $("#pourcent").textContent = `${pct} %`;
    $("#barre").style.width = `${pct}%`;
  }

  function rendreEtape(e) {
    const cls = ["step", etat.faites[e.id] && "is-done", e.id === etat.courante && "is-current", ouvertes.has(e.id) && "is-open"].filter(Boolean).join(" ");
    const nbDonjons = (e.tourDuMonde || []).length + (e.tornade || []).length + (e.donjons || []).length;
    return `<article class="${cls}" data-id="${e.id}">
      <div class="step__head" data-toggle="${e.id}">
        <input type="checkbox" class="check" data-faite="${e.id}" ${etat.faites[e.id] ? "checked" : ""} aria-label="Étape terminée">
        <span class="step__title">${echap(e.titre)}</span>
        <span class="step__meta">
          ${e.id === etat.courante ? `<span class="pill pill--accent">En cours</span>` : ""}
          ${e.succes.length ? `<span class="pill">${e.succes.length} succès</span>` : ""}
          ${nbDonjons ? `<span class="pill">${nbDonjons} donjon${nbDonjons > 1 ? "s" : ""}</span>` : ""}
        </span>
        <svg class="step__chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
      </div>
      <div class="step__body">
        ${contenuEtape(e, false)}
        <div class="step__actions">
          <button type="button" class="btn btn--small" data-suivre="${e.id}">Suivre cette étape dans l'overlay</button>
        </div>
      </div>
    </article>`;
  }

  // ---------- Actions communes (page et overlay) ----------
  function basculerFaite(id, valeur) {
    if (valeur) etat.faites[id] = true; else delete etat.faites[id];
    if (valeur && id === etat.courante) { aller(1); return; } // on passe à la suite
    sauver(); toutRendre();
  }
  function aller(delta) {
    const i = Math.min(etapes.length - 1, Math.max(0, index(etat.courante) + delta));
    etat.courante = etapes[i].id;
    ouvertes.add(etat.courante);
    sauver(); toutRendre();
  }
  function terminerCourante() {
    etat.faites[etat.courante] = true;
    aller(1);
  }
  let minuteurToast;
  function toast(msg) {
    [document, overlayDoc()].forEach((d) => {
      const t = d && d.getElementById("toast");
      if (!t) return;
      t.textContent = msg; t.classList.add("is-visible");
      clearTimeout(minuteurToast);
      minuteurToast = setTimeout(() => {
        [document, overlayDoc()].forEach((dd) => dd && dd.getElementById("toast") && dd.getElementById("toast").classList.remove("is-visible"));
      }, 1600);
    });
  }
  async function copier(txt, doc) {
    try {
      await (doc.defaultView.navigator.clipboard || navigator.clipboard).writeText(txt);
      toast(`Copié : ${txt}`);
    } catch {
      toast(`À copier : ${txt}`);
    }
  }

  function gererClic(ev, doc) {
    const t = ev.target;
    const travel = t.closest("[data-travel]");
    if (travel) { ev.stopPropagation(); copier(travel.dataset.travel, doc); return; }
    if (t.matches("[data-faite], [data-succes]")) return; // géré par "change"
    const suivre = t.closest("[data-suivre]");
    if (suivre) { etat.courante = suivre.dataset.suivre; sauver(); toutRendre(); toast("Étape affichée dans l'overlay"); return; }
    const toggle = t.closest("[data-toggle]");
    if (toggle) {
      const id = toggle.dataset.toggle;
      ouvertes.has(id) ? ouvertes.delete(id) : ouvertes.add(id);
      rendrePage(); return;
    }
    const onglet = t.closest("[data-guide]");
    if (onglet) { chargerGuide(onglet.dataset.guide); sauver(); toutRendre(); return; }
    const act = t.closest("[data-action]");
    if (act) ({ precedente: () => aller(-1), suivante: () => aller(1), terminer: terminerCourante })[act.dataset.action]();
  }
  function gererChangement(ev) {
    const t = ev.target;
    if (t.dataset.faite) basculerFaite(t.dataset.faite, t.checked);
    if (t.dataset.succes) {
      if (t.checked) etat.succes[t.dataset.succes] = true; else delete etat.succes[t.dataset.succes];
      sauver(); toutRendre();
    }
  }

  document.addEventListener("click", (ev) => gererClic(ev, document));
  document.addEventListener("change", gererChangement);
  $("#recherche").addEventListener("input", rendrePage);
  // Thème de couleur : appliqué à la page et à l'overlay.
  function appliquerTheme(t) {
    [document, overlayDoc()].forEach((d) => {
      if (!d) return;
      if (t) d.documentElement.dataset.theme = t; else delete d.documentElement.dataset.theme;
    });
  }
  $("#theme").value = document.documentElement.dataset.theme || "";
  $("#theme").addEventListener("change", (ev) => {
    appliquerTheme(ev.target.value);
    try { localStorage.setItem("guide-dofus:theme", ev.target.value); } catch { /* stockage indisponible */ }
  });
  $("#classe").addEventListener("change", (ev) => { etat.classe = ev.target.value; sauver(); rendrePersos(); toutRendre(); });

  // ---------- Gestion des personnages ----------
  const dialogue = $("#persos-dialog");
  function rendrePersos() {
    $("#perso").innerHTML = compte.persos.map((p) =>
      `<option value="${p.id}" ${p.id === etat.id ? "selected" : ""}>${echap(p.nom)}${p.classe ? " · " + echap(p.classe) : ""}</option>`).join("");
    $("#classe").value = etat.classe;
    const options = (c) => `<option value="">Classe…</option>` + GUIDES[0].classes.map((k) => `<option ${k === c ? "selected" : ""}>${echap(k)}</option>`).join("");
    $("#persos-liste").innerHTML = compte.persos.map((p) => {
      const nb = Object.keys(p.faites).length;
      return `<li class="perso ${p.id === etat.id ? "is-active" : ""}" data-perso="${p.id}">
        <input class="input" data-champ="nom" value="${echap(p.nom)}" aria-label="Nom du personnage" maxlength="40">
        <select class="select" data-champ="classe" aria-label="Classe">${options(p.classe)}</select>
        <input class="input perso__niv" data-champ="niveau" value="${echap(p.niveau || "")}" placeholder="Niv." inputmode="numeric" maxlength="3" aria-label="Niveau">
        <span class="perso__stat">${nb} étape${nb > 1 ? "s" : ""}</span>
        <button type="button" class="btn btn--small" data-jouer="${p.id}" ${p.id === etat.id ? "disabled" : ""}>${p.id === etat.id ? "Actif" : "Jouer"}</button>
        <button type="button" class="btn btn--small btn--ghost" data-supprimer="${p.id}" ${compte.persos.length < 2 ? "disabled" : ""} title="Supprimer">✕</button>
      </li>`;
    }).join("");
  }
  function changerPerso(id) {
    const p = compte.persos.find((x) => x.id === id);
    if (!p) return;
    etat = p;
    G = GUIDES.find((g) => g.id === etat.guide) || GUIDES[0];
    ouvertes.clear(); ouvertes.add(etat.courante);
    chargerGuide(G.id); sauver(); rendrePersos(); toutRendre();
    toast(`Personnage : ${p.nom}`);
  }
  $("#perso").addEventListener("change", (ev) => changerPerso(ev.target.value));
  $("#gerer-persos").addEventListener("click", () => { rendrePersos(); dialogue.showModal(); });
  $("#persos-fermer").addEventListener("click", () => dialogue.close());
  $("#perso-ajouter").addEventListener("click", () => {
    const p = nouveauPerso(`Personnage ${compte.persos.length + 1}`);
    compte.persos.push(p); sauver(); rendrePersos();
    dialogue.querySelector(`[data-perso="${p.id}"] [data-champ="nom"]`)?.select();
  });
  $("#persos-liste").addEventListener("change", (ev) => {
    const champ = ev.target.dataset.champ;
    const p = compte.persos.find((x) => x.id === ev.target.closest("[data-perso]")?.dataset.perso);
    if (!champ || !p) return;
    p[champ] = ev.target.value.trim() || (champ === "nom" ? "Sans nom" : "");
    sauver(); rendrePersos(); toutRendre();
  });
  let aSupprimer = null;
  $("#persos-liste").addEventListener("click", (ev) => {
    const jouer = ev.target.closest("[data-jouer]");
    if (jouer) { changerPerso(jouer.dataset.jouer); return; }
    const sup = ev.target.closest("[data-supprimer]");
    if (!sup) return;
    // Double clic de confirmation (pas de fenêtre de confirmation)
    if (aSupprimer !== sup.dataset.supprimer) {
      aSupprimer = sup.dataset.supprimer;
      sup.textContent = "Supprimer ?"; sup.classList.add("btn--danger");
      return;
    }
    compte.persos = compte.persos.filter((x) => x.id !== aSupprimer);
    if (etat.id === aSupprimer) changerPerso(compte.persos[0].id);
    aSupprimer = null; sauver(); rendrePersos();
  });
  // Export / import : un fichier pour passer d'un appareil à l'autre.
  $("#persos-exporter").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ format: "guide-dofus", version: 1, ...compte }, null, 1)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "guide-dofus-personnages.json" });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#persos-importer").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; ev.target.value = "";
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.format !== "guide-dofus" || !Array.isArray(data.persos)) throw new Error("format");
      let n = 0;
      data.persos.forEach((p) => {
        if (!p || typeof p.nom !== "string") return;
        const i = compte.persos.findIndex((x) => x.id === p.id);
        const propre = nouveauPerso(p.nom, p.classe, p);
        if (i >= 0) compte.persos[i] = propre; else compte.persos.push(propre);
        n++;
      });
      changerPerso(compte.persos.some((x) => x.id === etat.id) ? etat.id : compte.persos[0].id);
      toast(`${n} personnage${n > 1 ? "s" : ""} importé${n > 1 ? "s" : ""}`);
    } catch {
      toast("Ce fichier n'est pas une sauvegarde du Guide Dofus");
    }
  });
  $("#reinitialiser").addEventListener("click", () => {
    if (!confirm(`Effacer toute la progression de ${etat.nom} ?`)) return;
    etat.faites = {}; etat.succes = {}; etat.courantes = {}; etat.courante = etapes[0].id;
    sauver(); toutRendre();
  });

  // ---------- Overlay Picture-in-Picture ----------
  let overlay = null; // fenêtre PiP (ou popup de secours)
  const overlayDoc = () => (overlay && !overlay.closed ? overlay.document : null);

  function rendreOverlay() {
    const doc = overlayDoc();
    if (!doc) return;
    const e = courante();
    const i = index(e.id);
    const total = etapes.filter((x) => etat.faites[x.id]).length;
    const racine = doc.getElementById("ov");
    const scroll = racine.querySelector(".ov__card")?.scrollTop || 0;
    const memeEtape = racine.dataset.id === e.id;
    racine.dataset.id = e.id;
    racine.innerHTML = `
      <div class="ov__top">
        <span class="pill pill--accent">${echap(e.niveau === "" ? G.titre : e.niveau === "0" ? "Préambule" : "Niv. " + e.niveau)}</span>
        ${etat.faites[e.id] ? `<span class="pill">Terminée</span>` : ""}
        <span class="ov__count">Étape ${i + 1} / ${etapes.length}</span>
      </div>
      <div class="bar"><div class="bar__fill" style="width:${(total / etapes.length) * 100}%"></div></div>
      <div class="ov__card card">
        <h1 class="ov__title">${echap(e.titre)}</h1>
        ${contenuEtape(e, true)}
      </div>
      <div class="ov__nav">
        <button type="button" class="btn" data-action="precedente" ${i === 0 ? "disabled" : ""} title="Étape précédente">←</button>
        <button type="button" class="btn btn--accent" data-action="terminer">Terminée ✓</button>
        <button type="button" class="btn" data-action="suivante" ${i === etapes.length - 1 ? "disabled" : ""} title="Étape suivante">→</button>
      </div>`;
    if (memeEtape) racine.querySelector(".ov__card").scrollTop = scroll;
  }

  function preparerOverlay(win) {
    overlay = win;
    const doc = win.document;
    doc.title = "Guide Dofus · Overlay";
    // Copie les styles et la police de la page principale.
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => {
      const c = n.cloneNode(true);
      if (c.href) c.href = n.href; // chemin absolu
      doc.head.appendChild(c);
    });
    doc.documentElement.lang = "fr";
    if (document.documentElement.dataset.theme) doc.documentElement.dataset.theme = document.documentElement.dataset.theme;
    doc.body.innerHTML = `<div id="ov" class="ov"></div><div id="toast" class="toast" role="status" aria-live="polite"></div>`;
    doc.addEventListener("click", (ev) => gererClic(ev, doc));
    doc.addEventListener("change", gererChangement);
    doc.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowRight") aller(1);
      if (ev.key === "ArrowLeft") aller(-1);
    });
    win.addEventListener("pagehide", () => { overlay = null; });
    rendreOverlay();
  }

  $("#ouvrir-overlay").addEventListener("click", async () => {
    if (overlayDoc()) { overlay.focus(); return; }
    if ("documentPictureInPicture" in window) {
      try {
        const win = await window.documentPictureInPicture.requestWindow({ width: 380, height: 560 });
        preparerOverlay(win);
        return;
      } catch (err) {
        console.error(err);
      }
    }
    // Navigateur sans Document Picture-in-Picture (Firefox, Safari) : simple fenêtre popup.
    const win = window.open("", "guide-dofus-overlay", "width=380,height=600");
    if (!win) { toast("Autorise les popups pour ouvrir l'overlay"); return; }
    preparerOverlay(win);
    toast("Ton navigateur ne gère pas le Picture-in-Picture : fenêtre classique ouverte");
  });

  function toutRendre() {
    rendrePage();
    rendreOverlay();
  }

  // Petite interface pour js/compte.js (comptes en ligne).
  window.GuideDofus = {
    compte: () => JSON.parse(JSON.stringify(compte)),
    remplacer(nouveau) {
      compte.persos = nouveau.persos.map((p) => nouveauPerso(p.nom, p.classe, p));
      const actif = compte.persos.find((p) => p.id === nouveau.actif) || compte.persos[0];
      changerPerso(actif.id);
    },
    toast,
  };

  chargerGuide(etat.guide);
  rendrePersos();
  try { localStorage.setItem(CLE, JSON.stringify(compte)); } catch { /* stockage indisponible */ }
  toutRendre();
  requestAnimationFrame(() => {
    const el = document.querySelector(".step.is-current");
    if (el && index(etat.courante) > 0) el.scrollIntoView({ block: "center" });
  });
})();
