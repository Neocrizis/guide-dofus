(() => {
  "use strict";

  const G = window.GUIDE;
  const etapes = G.etapes;
  const CLE = "guide-dofus:progression";

  // ---------- État sauvegardé dans le navigateur ----------
  const etat = Object.assign(
    { faites: {}, succes: {}, courante: etapes[0].id, classe: "" },
    lire()
  );
  function lire() {
    try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; }
  }
  function sauver() {
    try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch { /* stockage indisponible */ }
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
  const groupes = [];
  etapes.forEach((e) => {
    const g = groupes[groupes.length - 1];
    if (g && g.niveau === e.niveau) g.etapes.push(e);
    else groupes.push({ niveau: e.niveau, etapes: [e] });
  });
  const nomGroupe = (n) => (n === "0" ? "Préambule" : /^\d+$/.test(n) ? `Niveau ${n}` : `Niveaux ${n}`);

  $("#titre-guide").textContent = G.titre;
  $("#sous-titre").textContent = `Par ${G.auteur} · version du jeu ${G.version} · ${etapes.length} étapes à suivre dans l'ordre, cochez au fur et à mesure.`;
  $("#nb-total").textContent = etapes.length;
  G.classes.forEach((c) => $("#classe").insertAdjacentHTML("beforeend", `<option>${echap(c)}</option>`));
  $("#classe").value = etat.classe;

  const ouvertes = new Set([etat.courante]);

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
  $("#classe").addEventListener("change", (ev) => { etat.classe = ev.target.value; sauver(); toutRendre(); });
  $("#reinitialiser").addEventListener("click", () => {
    if (!confirm("Effacer toute ta progression ?")) return;
    etat.faites = {}; etat.succes = {}; etat.courante = etapes[0].id;
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
        <span class="pill pill--accent">${echap(e.niveau === "0" ? "Préambule" : "Niv. " + e.niveau)}</span>
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

  toutRendre();
  requestAnimationFrame(() => {
    const el = document.querySelector(".step.is-current");
    if (el && index(etat.courante) > 0) el.scrollIntoView({ block: "center" });
  });
})();
