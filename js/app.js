(() => {
  "use strict";

  const GUIDES = window.GUIDES;
  // Le Dofus des Glaces est intégré aux étapes Frigost du guide : pas d'onglet à part.
  const ONGLETS = GUIDES.filter((g) => g.id !== "glaces");
  const CLE_ANCIENNE = "guide-dofus:progression"; // une seule progression (avant les personnages)
  const CLE = "guide-dofus:personnages";
  // ?mode=overlay : la page n'affiche que l'overlay (utilisé par l'appli Windows sans cadre, transparente).
  const MODE_OV = new URLSearchParams(location.search).get("mode") === "overlay";
  const CLE_OPACITE = "guide-dofus:ov-opacite";

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
  // Ancien onglet Dofus des Glaces ouvert : on revient au guide principal, à sa dernière étape.
  compte.persos.forEach((p) => {
    if (ONGLETS.some((g) => g.id === p.guide)) return;
    p.courantes = p.courantes || {};
    p.courantes[p.guide] = p.courante;
    p.guide = GUIDES[0].id;
    p.courante = p.courantes[p.guide] || GUIDES[0].etapes[0].id;
  });
  let G = ONGLETS.find((g) => g.id === etat.guide) || GUIDES[0];
  let etapes = G.etapes;
  // ---------- Personnage animé (rendu maison à partir des fichiers du jeu) ----------
  let CATALOGUE = null;
  window.RenduPerso?.catalogue().then((c) => { CATALOGUE = c; rendreAccueil(); }).catch(() => {});
  const classeCat = (p) => CATALOGUE?.find((c) => c.nom === p.classe);
  // Apparence complète du personnage : corps, tête et couleurs (celles de la classe par défaut).
  function lookPerso(p) {
    const c = classeCat(p);
    if (!c) return null;
    const l = p.look || {}, g = c[l.sexe === "f" ? "f" : "m"];
    return { corps: g.corpsListe?.[l.corps || 0] ?? g.corps, tete: g.tetes[Math.min(l.tete || 0, g.tetes.length - 1)], couleurs: g.couleurs.map((d, i) => l.couleurs?.[i] ?? d) };
  }
  // Portrait (tête) du personnage, tiré du rendu animé : même classe, sexe, visage et couleurs.
  // Dessiné une fois par apparence sur un canvas caché, puis gardé en image.
  const portraits = new Map();
  let toilePortrait = null, filePortraits = Promise.resolve();
  function portrait(p) {
    const look = lookPerso(p);
    if (!look || !window.RenduPerso) return "";
    const cle = JSON.stringify(look);
    if (portraits.has(cle)) return portraits.get(cle);
    portraits.set(cle, "");
    filePortraits = filePortraits.then(async () => {
      toilePortrait = toilePortrait || Object.assign(document.createElement("canvas"), { width: 128, height: 128 });
      await window.RenduPerso.dessiner(toilePortrait, look, { fixe: true, portrait: true });
      const url = toilePortrait.toDataURL("image/webp");
      portraits.set(cle, url);
      document.querySelectorAll(`[data-portrait="${CSS.escape(cle)}"]`).forEach((el) => { el.innerHTML = `<img src="${url}" alt="">`; });
    }).catch(() => {});
    return "";
  }
  function mini(p) {
    const url = portrait(p), cle = lookPerso(p) ? JSON.stringify(lookPerso(p)) : "";
    return `<span class="dash-liste__mini" ${cle ? `data-portrait="${echap(cle)}"` : ""}>${url ? `<img src="${url}" alt="">` : echap(initiales(p.classe))}</span>`;
  }
  const hex = (n) => "#" + n.toString(16).padStart(6, "0");
  const NOMS_CORPS = ["Classique", "Rétro", "Avant-gardiste"];
  const NOMS_COULEURS = ["Peau", "Cheveux", "Couleur 3", "Couleur 4", "Couleur 5", "Couleur 6"];
  function apparence(p) {
    const c = classeCat(p), l = p.look || {}, sexe = l.sexe === "f" ? "f" : "m", look = lookPerso(p);
    return `<details class="apparence">
      <summary class="btn btn--small btn--ghost">Personnaliser</summary>
      <div class="apparence__corps">
        <div class="apparence__ligne" role="group" aria-label="Sexe">
          ${[["m", "Mâle"], ["f", "Femelle"]].map(([k, t]) => `<button type="button" class="pastille ${k === sexe ? "is-on" : ""}" data-look="sexe" data-val="${k}" aria-pressed="${k === sexe}">${t}</button>`).join("")}
        </div>
        ${(c[sexe].corpsListe || []).length > 1 ? `<div class="apparence__ligne" role="group" aria-label="Corps">
          ${c[sexe].corpsListe.map((_, i) => `<button type="button" class="pastille ${i === (l.corps || 0) ? "is-on" : ""}" data-look="corps" data-val="${i}" aria-pressed="${i === (l.corps || 0)}">${NOMS_CORPS[i] || "Corps " + (i + 1)}</button>`).join("")}
        </div>` : ""}
        <div class="apparence__ligne" role="group" aria-label="Visage">
          ${c[sexe].tetes.map((_, i) => { const nom = c[sexe].tetesNoms?.[i] || ""; let n = 0; for (let j = 0; j <= i; j++) if (!c[sexe].tetesNoms?.[j]) n++; return `<button type="button" class="pastille ${i === (l.tete || 0) ? "is-on" : ""}" data-look="tete" data-val="${i}" aria-pressed="${i === (l.tete || 0)}" aria-label="Visage ${nom || n}" title="Visage ${nom || n}">${nom || n}</button>`; }).join("")}
        </div>
        <div class="apparence__couleurs">
          ${look.couleurs.map((n, i) => `<div class="apparence__couleur"><input type="color" value="${hex(n)}" data-look-couleur="${i}" aria-label="${NOMS_COULEURS[i]}" title="${NOMS_COULEURS[i]}">
            <span>${NOMS_COULEURS[i]}</span>
            <input class="apparence__hex" type="text" value="${hex(n).toUpperCase()}" maxlength="7" spellcheck="false" data-look-hex="${i}" aria-label="${NOMS_COULEURS[i]} (code hexadécimal)"></div>`).join("")}
        </div>
        <button type="button" class="btn btn--small btn--ghost" data-look="defaut">Couleurs par défaut</button>
      </div>
    </details>`;
  }
  // Un seul canvas, déplacé dans le tableau de bord à chaque rendu : l'animation ne repart pas de zéro.
  const toile = document.createElement("canvas");
  toile.width = 240; toile.height = 300;
  let lookAffiche = "";
  function montrerRendu(force) {
    const place = document.querySelector("[data-rendu-perso]");
    const look = lookPerso(etat);
    if (!place || !look) return;
    place.appendChild(toile);
    const cle = JSON.stringify(look);
    if (cle === lookAffiche && !force) return;
    lookAffiche = cle;
    window.RenduPerso.dessiner(toile, look).catch(() => { place.replaceWith(Object.assign(document.createElement("div"), { className: "dash-perso__embleme", textContent: initiales(etat.classe) })); });
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-look]");
    if (!b) return;
    const l = (etat.look = etat.look || {});
    if (b.dataset.look === "sexe") { l.sexe = b.dataset.val; l.tete = 0; }
    else if (b.dataset.look === "tete") l.tete = +b.dataset.val;
    else if (b.dataset.look === "corps") l.corps = +b.dataset.val;
    else delete l.couleurs;
    sauver(); rendreAccueil();
    document.querySelector(".apparence")?.setAttribute("open", "");
  });
  // Code hexadécimal tapé à la main (comme dans le jeu) : appliqué dès qu'il est complet (#RRGGBB ou RRGGBB).
  document.addEventListener("input", (ev) => {
    const i = ev.target.dataset?.lookHex;
    if (i == null) return;
    const m = ev.target.value.trim().match(/^#?([0-9a-f]{6})$/i);
    ev.target.classList.toggle("is-invalide", !m && ev.target.value.trim() !== "");
    if (!m) return;
    const l = (etat.look = etat.look || {});
    l.couleurs = lookPerso(etat).couleurs;
    l.couleurs[+i] = parseInt(m[1], 16);
    const pastille = document.querySelector(`[data-look-couleur="${i}"]`);
    if (pastille) pastille.value = "#" + m[1].toLowerCase();
    sauver(); montrerRendu();
  });
  document.addEventListener("input", (ev) => {
    const i = ev.target.dataset?.lookCouleur;
    if (i == null) return;
    const l = (etat.look = etat.look || {});
    l.couleurs = lookPerso(etat).couleurs;
    l.couleurs[+i] = parseInt(ev.target.value.slice(1), 16);
    const champ = document.querySelector(`[data-look-hex="${i}"]`);
    if (champ) champ.value = ev.target.value.toUpperCase();
    montrerRendu();
  });
  document.addEventListener("change", (ev) => { if (ev.target.dataset?.lookCouleur != null) { sauver(); rendreAccueil(); document.querySelector(".apparence")?.setAttribute("open", ""); } });

  function sauver() {
    compte.actif = etat.id;
    etat.maj = Date.now();
    try { localStorage.setItem(CLE, JSON.stringify(compte)); } catch { /* stockage indisponible */ }
    window.dispatchEvent(new CustomEvent("guide:sauve")); // synchronisation en ligne (js/compte.js)
  }

  // Journal d'activité affiché sur le tableau de bord (30 dernières actions).
  function noter(titre, type) {
    etat.journal = [{ titre, type, date: Date.now() }, ...(etat.journal || [])].slice(0, 30);
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
  // Bouton « Détail » quand la case correspond à des quêtes connues (js/quetes.js).
  function boutonsQuete(s) {
    if (!window.Quetes) return "";
    const lignes = String(s).split("\n").map((l) => l.trim()).filter((l) => window.Quetes.idsPour(l));
    if (!lignes.length) return "";
    const multi = String(s).includes("\n");
    return `<span class="quete-btns">${lignes.map((l) =>
      `<button type="button" class="quete-btn" data-quete="${echap(l)}" title="Voir le détail de la quête">${multi ? echap(l.replace(/^[^:]+ : /, "")) : "Détail"}</button>`).join("")}</span>`;
  }
  function listeSucces(e) {
    if (!e.succes.length) return "";
    return `<ul class="list">${e.succes.map((s, i) => {
      const k = `${e.id}|${i}`;
      return `<li><label><input type="checkbox" class="check" data-succes="${k}" ${etat.succes[k] ? "checked" : ""}><span>${texte(s)}</span></label>${boutonsQuete(s)}</li>`;
    }).join("")}</ul>`;
  }
  // Quêtes du Dofus des Glaces affichées dans les étapes Frigost du guide de progression.
  // Les cases gardent les identifiants du guide « glaces » (g1…g11), comptés sur le tableau de bord.
  const GLACES_DANS_ETAPE = {
    e63: ["g1", "g2"], e74: ["g3", "g4"], e79: ["g5"], e81: ["g6"], e93: ["g7"],
    e100: ["g8"], e108: ["g9"], e109: ["g10"], e115: ["g11"],
  };
  const zonesGlaces = (e) => (GLACES_DANS_ETAPE[e.id] || [])
    .map((id) => GUIDES.find((g) => g.id === "glaces")?.etapes.find((z) => z.id === id)).filter(Boolean);
  function sectionGlaces(e) {
    return zonesGlaces(e).map((z) => {
      const faits = z.succes.filter((_, i) => etat.succes[`${z.id}|${i}`]).length;
      return section(`Dofus des Glaces · ${echap(z.titre)} (${faits}/${z.succes.length})`, listeSucces(z), "glaces");
    }).join("");
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
      sectionGlaces(e),
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
    G = ONGLETS.find((g) => g.id === id) || GUIDES[0];
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
    $("#guides").innerHTML = ONGLETS.map((g) =>
      `<button type="button" class="tab ${g.id === G.id ? "is-active" : ""}" data-guide="${g.id}">${echap(g.titre)}</button>`).join("");
    $("#recherche").value = "";
  }


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
          <button type="button" class="btn btn--ghost btn--small" data-groupe="${gi}">${faites === g.etapes.length ? "Tout décocher" : "Tout cocher"}</button>
        </div>
        <div class="group__list">${visibles.map(rendreEtape).join("")}</div>
      </section>`;
    });
    $("#etapes").innerHTML = html || `<div class="empty card">Aucune étape ne correspond à « ${echap(q)} ».</div>`;

    $("#chapitres").innerHTML = groupes.map((g, gi) => {
      const faites = g.etapes.filter((e) => etat.faites[e.id]).length;
      return `<a class="chapter ${faites === g.etapes.length ? "is-done" : ""}" href="#guide" data-chapitre="g${gi}">
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
          ${zonesGlaces(e).length ? `<span class="pill pill--glaces">Dofus des Glaces</span>` : ""}
          ${nbDonjons ? `<span class="pill">${nbDonjons} donjon${nbDonjons > 1 ? "s" : ""}</span>` : ""}
        </span>
        <svg class="step__chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
      </div>
      <div class="step__body">
        ${contenuEtape(e, false)}
        <div class="step__actions">
          <button type="button" class="btn btn--small" data-suivre="${e.id}">Suivre cette étape dans l'overlay</button>
          <button type="button" class="btn btn--small btn--ghost" data-jusqua="${e.id}">Tout cocher jusqu'ici</button>
          ${/Éternelle Moisson/i.test(e.titre) ? `<a class="btn btn--small btn--accent" href="#archimonstres">Voir la liste des archimonstres</a>` : ""}
        </div>
      </div>
    </article>`;
  }

  // ---------- Actions communes (page et overlay) ----------
  function basculerFaite(id, valeur) {
    if (valeur) etat.faites[id] = true; else delete etat.faites[id];
    const e = etapes.find((x) => x.id === id);
    if (valeur && e) noter(e.titre, G.id === "progression" ? "Étape du guide" : G.titre);
    if (valeur && id === etat.courante) { aller(1); return; } // on passe à la suite
    sauver(); toutRendre();
  }
  function aller(delta) {
    const i = Math.min(etapes.length - 1, Math.max(0, index(etat.courante) + delta));
    etat.courante = etapes[i].id;
    ouvertes.add(etat.courante);
    sauver(); toutRendre();
  }
  // Coche plusieurs étapes d'un coup, puis place l'étape en cours sur la première non faite.
  function cocherPlusieurs(liste, valeur) {
    liste.forEach((e) => { if (valeur) etat.faites[e.id] = true; else delete etat.faites[e.id]; });
    const suivante = etapes.find((e) => !etat.faites[e.id]);
    if (valeur && etat.faites[etat.courante] && suivante) { etat.courante = suivante.id; ouvertes.add(suivante.id); }
    sauver(); toutRendre();
  }
  function cocherJusqua(id) {
    const liste = etapes.slice(0, index(id) + 1);
    cocherPlusieurs(liste, true);
    noter(`${liste.length} étapes cochées jusqu'à « ${liste[liste.length - 1].titre} »`, G.titre);
    toast(`${liste.length} étape${liste.length > 1 ? "s" : ""} cochée${liste.length > 1 ? "s" : ""}`);
  }
  function cocherGroupe(gi) {
    const g = groupes[gi];
    const tout = g.etapes.every((e) => etat.faites[e.id]);
    if (!tout) noter(`Chapitre « ${nomGroupe(g.niveau)} » terminé`, G.titre);
    cocherPlusieurs(g.etapes, !tout);
    toast(tout ? "Chapitre décoché" : "Chapitre coché");
  }
  function terminerCourante() {
    if (!etat.faites[etat.courante]) noter(courante().titre, G.id === "progression" ? "Étape du guide" : G.titre);
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
    if (t.matches("[data-faite], [data-succes], [data-archi]")) return; // géré par "change"
    const suivre = t.closest("[data-suivre]");
    if (suivre) { etat.courante = suivre.dataset.suivre; sauver(); toutRendre(); toast("Étape affichée dans l'overlay"); return; }
    if ((doc !== document || MODE_OV) && ovQuete) {
      if (t.closest("[data-ov-retour]")) { fermerQueteOverlay(); return; }
      if (window.Quetes.gererClic(ovQuete, ev)) return;
    }
    const quete = t.closest("[data-quete]");
    if (quete) {
      ev.preventDefault();
      if (doc !== document || MODE_OV) ouvrirQueteOverlay(quete.dataset.quete);
      else window.Quetes?.ouvrir(quete.dataset.quete);
      return;
    }
    const chap = t.closest("[data-chapitre]");
    if (chap) { ev.preventDefault(); doc.getElementById(chap.dataset.chapitre)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const continuer = t.closest("[data-continuer]");
    if (continuer) {
      chargerGuide(continuer.dataset.continuer); sauver(); toutRendre();
      location.hash = "guide"; return;
    }
    if (t.closest("[data-ov-compte]")) { $("#compte-btn").click(); return; }
    if (t.closest("[data-ov-recharger]")) { const u = new URL(location.href); u.searchParams.set("r", Date.now()); location.replace(u); return; }
    if (t.closest("[data-ov-menu]")) { reglagesOuverts = !reglagesOuverts; doc.querySelector(".ov__reglages")?.toggleAttribute("hidden", !reglagesOuverts); return; }
    const taille = t.closest("[data-ov-taille]");
    if (taille) { majPrefsOv({ taille: Math.min(150, Math.max(70, prefsOv().taille + 10 * +taille.dataset.ovTaille)) }); return; }
    if (t.matches("[data-ov-compact]")) { majPrefsOv({ compact: t.checked }); return; }
    const jouerDash = t.closest("[data-dash-perso]");
    if (jouerDash) { changerPerso(jouerDash.dataset.dashPerso); return; }
    const dashAction = t.closest("[data-dash]");
    if (dashAction) {
      ({ persos: () => $("#gerer-persos").click(), compte: () => $("#compte-btn").click(), overlay: () => $("#ouvrir-overlay").click() })[dashAction.dataset.dash]();
      return;
    }
    const etapeArchis = t.closest("[data-archis-etape]");
    if (etapeArchis) { cocherEtapeArchis(+etapeArchis.dataset.archisEtape); return; }
    const jusqua = t.closest("[data-jusqua]");
    if (jusqua) { cocherJusqua(jusqua.dataset.jusqua); return; }
    const groupe = t.closest("[data-groupe]");
    if (groupe) { cocherGroupe(+groupe.dataset.groupe); return; }
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
    if (t.dataset.archi) cocherArchi(+t.dataset.archi, t.checked);
    if (t.dataset.succes) {
      if (t.checked) etat.succes[t.dataset.succes] = true; else delete etat.succes[t.dataset.succes];
      if (t.checked) noter(t.closest("label")?.textContent.trim() || "Quête", { e: "Succès / quête", g: "Dofus des Glaces", a: "Avis de recherche" }[t.dataset.succes[0]]);
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

  // ---------- Gestion des personnages ----------
  const dialogue = $("#persos-dialog");
  function rendrePersos() {
    const options = (c) => `<option value="">Classe…</option>` + [...GUIDES[0].classes, "Forgelance"].map((k) => `<option ${k === c ? "selected" : ""}>${echap(k)}</option>`).join("");
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
    G = ONGLETS.find((g) => g.id === etat.guide) || GUIDES[0];
    ouvertes.clear(); ouvertes.add(etat.courante);
    chargerGuide(G.id); sauver(); rendrePersos(); toutRendre();
    toast(`Personnage : ${p.nom}`);
  }
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

  // Détail d'une quête affiché dans l'overlay, à la place de l'étape.
  let ovQuete = null;
  function ouvrirQueteOverlay(texte) {
    const doc = overlayDoc();
    if (!doc || !window.Quetes) return;
    const racine = doc.getElementById("ov");
    racine.dataset.id = "";
    racine.innerHTML = `${enteteOv()}
      <div class="ov__top"><button type="button" class="btn btn--small" data-ov-retour>← Retour à l'étape</button></div>
      <div class="ov__card card ov__quete"></div>`;
    ovQuete = { el: racine.querySelector(".ov__quete"), liste: null,
      apresFait: () => { fermerQueteOverlay(); toast("Quête terminée"); } };
    window.Quetes.montrer(ovQuete, texte);
  }
  function fermerQueteOverlay() {
    ovQuete = null;
    rendreOverlay();
  }

  // Barre de titre façon journal de quêtes du jeu. Dans l'appli (mode overlay) : poignée pour déplacer
  // la fenêtre et réglage de la transparence.
  function opaciteOv() { try { return +(localStorage.getItem(CLE_OPACITE) ?? 85); } catch { return 85; } }
  function enteteOv() {
    return `<div class="ov__barre" data-tauri-drag-region>
      <img class="ov__barre-ico" src="${new URL("img/outils/quest.webp", location.href)}" alt="" data-tauri-drag-region>
      <span class="ov__barre-titre" data-tauri-drag-region>Dofus Guide</span>
      ${MODE_OV ? `<button type="button" class="ov__compte" data-ov-compte title="Mon compte (synchronisation avec le site)" aria-label="Mon compte"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4.5"/><path d="M3 21c0-4.4 4-7 9-7s9 2.6 9 7z"/></svg></button>
      <button type="button" class="ov__menu-btn ov__recharger" data-ov-recharger title="Recharger le guide" aria-label="Recharger le guide"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg></button>
      <button type="button" class="ov__menu-btn" data-ov-menu title="Réglages" aria-label="Réglages">⋮</button>` : ""}
    </div>
    ${MODE_OV ? `<div class="ov__reglages" ${reglagesOuverts ? "" : "hidden"}>
      <label>Fond <input type="range" min="0" max="100" value="${opaciteOv()}" data-ov-opacite aria-label="Opacité du fond"></label>
      <div class="ov__reglage">Texte
        <button type="button" data-ov-taille="-1" aria-label="Texte plus petit">A−</button>
        <button type="button" data-ov-taille="1" aria-label="Texte plus grand">A+</button>
      </div>
      <label class="ov__reglage"><input type="checkbox" data-ov-compact ${prefsOv().compact ? "checked" : ""}> Compact</label>
    </div>` : ""}`;
  }
  // Réglages de l'appli : taille du texte (en %) et mode compact.
  const CLE_APPLI = "guide-dofus:appli";
  let reglagesOuverts = false;
  function prefsOv() { try { return { taille: 100, compact: false, ...JSON.parse(localStorage.getItem(CLE_APPLI) || "{}") }; } catch { return { taille: 100, compact: false }; } }
  function majPrefsOv(maj) {
    const p = { ...prefsOv(), ...maj };
    try { localStorage.setItem(CLE_APPLI, JSON.stringify(p)); } catch { /* stockage indisponible */ }
    appliquerPrefsOv(p);
  }
  function appliquerPrefsOv(p = prefsOv()) {
    document.documentElement.style.setProperty("--ov-taille", String(p.taille / 100));
    document.documentElement.classList.toggle("ov-compact", !!p.compact);
  }
  function appliquerOpacite(doc = overlayDoc()) {
    doc?.documentElement.style.setProperty("--ov-alpha", String(opaciteOv() / 100));
  }
  document.addEventListener("input", (ev) => {
    if (!ev.target.matches?.("[data-ov-opacite]")) return;
    try { localStorage.setItem(CLE_OPACITE, ev.target.value); } catch { /* stockage indisponible */ }
    appliquerOpacite(document);
  });

  function rendreOverlay() {
    const doc = overlayDoc();
    if (!doc) return;
    if (ovQuete) return; // on garde le détail affiché jusqu'au retour
    const e = courante();
    const i = index(e.id);
    const total = etapes.filter((x) => etat.faites[x.id]).length;
    const racine = doc.getElementById("ov");
    const scroll = racine.querySelector(".ov__card")?.scrollTop || 0;
    const memeEtape = racine.dataset.id === e.id;
    racine.dataset.id = e.id;
    racine.innerHTML = `
      ${enteteOv()}
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
      if (ovQuete && (ev.key === "Escape" || ev.key === "Backspace")) { fermerQueteOverlay(); return; }
      if (ovQuete) return;
      if (ev.key === "ArrowRight") aller(1);
      if (ev.key === "ArrowLeft") aller(-1);
    });
    win.addEventListener("pagehide", () => { overlay = null; ovQuete = null; });
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

  // Outil externe (chasse au trésor DofusDB) ouvert dans une petite fenêtre toujours au premier plan.
  document.addEventListener("click", async (ev) => {
    const lien = ev.target.closest("[data-outil-overlay]");
    if (!lien || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    ev.preventDefault();
    lien.closest("details")?.removeAttribute("open");
    const url = lien.href, titre = lien.querySelector("b")?.textContent || "Outil";
    if ("documentPictureInPicture" in window) {
      try {
        const win = await window.documentPictureInPicture.requestWindow({ width: 420, height: 680 });
        win.document.title = titre;
        win.document.body.style.cssText = "margin:0;background:#141a2b;overflow:hidden";
        const f = win.document.createElement("iframe");
        f.src = url; f.title = titre; f.allow = "clipboard-write";
        f.style.cssText = "border:0;width:100vw;height:100vh;display:block";
        win.document.body.append(f);
        return;
      } catch (err) { console.error(err); }
    }
    const win = window.open(url, "guide-dofus-outil", "width=420,height=700");
    if (!win) window.open(url, "_blank", "noopener");
  });



  // ---------- Archimonstres (quête « L'éternelle moisson », Dofus Ocre) ----------
  const ARCHIS = window.ARCHIMONSTRES || { etapes: [], monstres: [] };
  const capture = (m) => !!(etat.archis && etat.archis[m.id]);
  function bilanArchis(p) {
    const pris = p.archis || {};
    const archis = ARCHIS.monstres.filter((m) => m.archi), boss = ARCHIS.monstres.filter((m) => !m.archi);
    return {
      archis: archis.length, archisPris: archis.filter((m) => pris[m.id]).length,
      boss: boss.length, bossPris: boss.filter((m) => pris[m.id]).length,
    };
  }
  (() => {
    const etapesOpt = ARCHIS.etapes.map((e) => `<option value="${e.n}">Étape ${e.n} · niv. ${e.niveau}</option>`).join("");
    $("#archis-etape").innerHTML = `<option value="">Toutes les étapes</option>${etapesOpt}`;
    const zones = [...new Set(ARCHIS.monstres.map((m) => m.zone).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
    $("#archis-zone").innerHTML = `<option value="">Toutes les zones</option>` + zones.map((z) => `<option>${echap(z)}</option>`).join("");
  })();
  function rendreArchis() {
    if ($("#vue-archis").hidden) return;
    const q = $("#archis-recherche").value.trim().toLowerCase();
    const etape = $("#archis-etape").value, zone = $("#archis-zone").value, type = $("#archis-type").value;
    const masquer = $("#archis-masquer").checked;
    const b = bilanArchis(etat);
    $("#archis-nb").textContent = b.archisPris; $("#archis-total").textContent = b.archis;
    $("#boss-nb").textContent = b.bossPris; $("#boss-total").textContent = b.boss;
    const p = Math.round(((b.archisPris + b.bossPris) / (b.archis + b.boss || 1)) * 100);
    $("#archis-barre").style.width = `${p}%`; $("#archis-pourcent").textContent = `${p} %`;
    const garde = (m) => (!etape || String(m.etape) === etape) && (!zone || m.zone === zone)
      && (!type || (type === "archi") === m.archi) && (!masquer || !capture(m))
      && (!q || `${m.nom} ${m.sousZone} ${m.zone}`.toLowerCase().includes(q));
    const html = ARCHIS.etapes.map((e) => {
      const tous = ARCHIS.monstres.filter((m) => m.etape === e.n);
      const visibles = tous.filter(garde);
      if (!visibles.length) return "";
      const pris = tous.filter(capture).length;
      return `<section class="group card">
        <div class="group__head">
          <span class="group__badge">${e.n}</span>
          <h2 class="group__title">Étape ${e.n} <small>· niveau ${e.niveau}</small></h2>
          <span class="group__pct">${pris} / ${tous.length}</span>
          <button type="button" class="btn btn--ghost btn--small" data-archis-etape="${e.n}">${pris === tous.length ? "Tout décocher" : "Tout cocher"}</button>
        </div>
        <ul class="archis__grille">${visibles.map((m) => `<li class="archi ${capture(m) ? "is-pris" : ""}">
          <label>
            <input type="checkbox" class="check" data-archi="${m.id}" ${capture(m) ? "checked" : ""}>
            <span class="archi__img"><img src="https://api.dofusdb.fr/img/monsters/${m.gfx || m.id}.png" alt="" loading="lazy" onerror="this.remove()"></span>
            <span class="archi__nom">${echap(m.nom)}${m.archi ? "" : ` <span class="pill pill--accent">Boss</span>`}</span>
            <span class="archi__niv">Niv. ${m.niveau}</span>
            <span class="archi__zone">${echap(m.sousZone)}${m.zone && m.zone !== m.sousZone ? ` · ${echap(m.zone)}` : ""}</span>
          </label></li>`).join("")}</ul>
      </section>`;
    }).join("");
    $("#archis-liste").innerHTML = html || `<div class="empty card">Aucun monstre ne correspond à ces filtres.</div>`;
  }
  function cocherArchi(id, valeur) {
    etat.archis = etat.archis || {};
    const m = ARCHIS.monstres.find((x) => x.id === id);
    if (valeur) { etat.archis[id] = true; if (m) noter(m.nom, m.archi ? "Archimonstre capturé" : "Boss capturé"); }
    else delete etat.archis[id];
    sauver(); rendreArchis(); rendreAccueil();
  }
  function cocherEtapeArchis(n) {
    etat.archis = etat.archis || {};
    const liste = ARCHIS.monstres.filter((m) => m.etape === n);
    const tout = liste.every(capture);
    liste.forEach((m) => { if (tout) delete etat.archis[m.id]; else etat.archis[m.id] = true; });
    if (!tout) noter(`Étape ${n} de L'éternelle moisson complétée`, "Archimonstres");
    sauver(); rendreArchis(); rendreAccueil();
    toast(tout ? `Étape ${n} décochée` : `Étape ${n} cochée`);
  }
  ["#archis-recherche", "#archis-etape", "#archis-zone", "#archis-type", "#archis-masquer"].forEach((s) =>
    $(s).addEventListener(s === "#archis-recherche" ? "input" : "change", rendreArchis));

  // ---------- Tableau de bord (page d'accueil) ----------
  const fmt = (n) => n.toLocaleString("fr-FR");
  function depuis(date) {
    const min = Math.round((Date.now() - date) / 60000);
    if (min < 1) return "À l'instant";
    if (min < 60) return `Il y a ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `Il y a ${h} h`;
    const j = Math.round(h / 24);
    return j === 1 ? "Hier" : `Il y a ${j} jours`;
  }
  // Compte ce qu'un personnage a fait dans un guide : étapes, et cases « succès / quêtes ».
  function bilan(p, guide) {
    let etapesFaites = 0, items = 0, itemsFaits = 0;
    guide.etapes.forEach((e) => {
      if (p.faites[e.id]) etapesFaites++;
      items += e.succes.length;
      e.succes.forEach((_, i) => { if (p.succes[`${e.id}|${i}`]) itemsFaits++; });
    });
    return { etapes: guide.etapes.length, etapesFaites, items, itemsFaits };
  }
  // Quêtes du jeu validées via le guide : cases cochées, et toutes les cases d'une étape terminée
  // (avec les quêtes du Dofus des Glaces affichées dans les étapes Frigost). Sert aux pages Dofus.
  function quetesGuide(p = etat) {
    const res = {};
    const ajouter = (s) => String(s).split("\n").forEach((l) => (window.Quetes?.idsPour(l) || []).forEach((id) => { res[id] = 1; }));
    GUIDES.forEach((g) => g.etapes.forEach((e) => {
      const finie = !!p.faites?.[e.id];
      e.succes.forEach((s, i) => { if (finie || p.succes?.[`${e.id}|${i}`]) ajouter(s); });
      if (finie) zonesGlaces(e).forEach((z) => z.succes.forEach(ajouter));
    }));
    return res;
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const initiales = (c) => (c ? c.slice(0, 2) : "?");
  const niveauNum = (p) => Math.min(200, Math.max(0, parseInt(p.niveau, 10) || 0));

  function tuile(label, valeur, total, icone) {
    return `<div class="tuile">
      <span class="tuile__icone" aria-hidden="true">${icone}</span>
      <div><div class="tuile__label">${label}</div>
      <div class="tuile__valeur">${fmt(valeur)} <span>/ ${fmt(total)}</span></div></div>
    </div>`;
  }
  function barre(label, a, b) {
    return `<div class="dash-barre">
      <div class="dash-barre__haut"><span>${label}</span><b>${fmt(a)} / ${fmt(b)}</b></div>
      <div class="bar"><div class="bar__fill" style="width:${pct(a, b)}%"></div></div>
    </div>`;
  }
  const ICONES = {
    etapes: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M3 5h2v2H3zm4 0h14v2H7zM3 11h2v2H3zm4 0h14v2H7zm-4 6h2v2H3zm4 0h14v2H7z"/></svg>`,
    succes: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19 4h-2V3H7v1H5a2 2 0 0 0-2 2v1a4 4 0 0 0 3.6 4A5 5 0 0 0 11 14.9V18H8v2h8v-2h-3v-3.1A5 5 0 0 0 17.4 11 4 4 0 0 0 21 7V6a2 2 0 0 0-2-2zM5 7V6h2v3a2 2 0 0 1-2-2zm14 0a2 2 0 0 1-2 2V6h2z"/></svg>`,
    glaces: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M11 2h2v4.2l2.6-2.6 1.4 1.4-4 4V11h2l4-4 1.4 1.4-2.6 2.6H22v2h-4.2l2.6 2.6-1.4 1.4-4-4H13v2l4 4-1.4 1.4-2.6-2.6V22h-2v-4.2l-2.6 2.6L7 19l4-4v-2H9l-4 4-1.4-1.4L6.2 13H2v-2h4.2L3.6 8.4 5 7l4 4h2V9L7 5l1.4-1.4L11 6.2z"/></svg>`,
    archis: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2C7 2 4 5.6 4 10c0 2.6 1.2 4.6 3 6v4h2v-2h2v2h2v-2h2v2h2v-4c1.8-1.4 3-3.4 3-6 0-4.4-3-8-8-8zm-3 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>`,
    avis: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z"/></svg>`,
  };

  function rendreAccueil() {
    const racine = $("#vue-accueil");
    if (racine.hidden) return;
    const [gP, gG, gA] = ["progression", "glaces", "avis"].map((id) => GUIDES.find((g) => g.id === id));
    const bP = bilan(etat, gP), bG = bilan(etat, gG), bA = bilan(etat, gA), bR = bilanArchis(etat);
    const niv = niveauNum(etat);
    const parts = [pct(bP.etapesFaites, bP.etapes), pct(bP.itemsFaits, bP.items), pct(bA.itemsFaits, bA.items), pct(bR.archisPris, bR.archis)];
    const global = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
    const connecte = $("#compte-btn").classList.contains("is-connecte");
    const compteVisible = !$("#compte-btn").hidden;
    const journal = (etat.journal || []).slice(0, 6);

    const reprendre = [gP, gA].map((g) => {
      const id = etat.guide === g.id ? etat.courante : etat.courantes[g.id];
      const e = g.etapes.find((x) => x.id === id) || g.etapes.find((x) => !etat.faites[x.id]) || g.etapes[0];
      const b = bilan(etat, g);
      return `<button type="button" class="reprendre" data-continuer="${g.id}">
        <span class="reprendre__guide">${echap(g.titre)} · ${pct(b.etapesFaites, b.etapes)} %</span>
        <span class="reprendre__titre">${echap(e.titre)}</span>
        <span class="reprendre__go">Continuer →</span>
      </button>`;
    }).join("") + `<a class="reprendre" href="#archimonstres">
        <span class="reprendre__guide">Archimonstres · ${pct(bR.archisPris + bR.bossPris, bR.archis + bR.boss)} %</span>
        <span class="reprendre__titre">${bR.archisPris} archimonstre${bR.archisPris > 1 ? "s" : ""} et ${bR.bossPris} boss capturé${bR.archisPris + bR.bossPris > 1 ? "s" : ""}</span>
        <span class="reprendre__go">Voir la liste →</span>
      </a>`;

    racine.innerHTML = `
      <aside class="dash__cote">
        <div class="card dash-perso">
          ${lookPerso(etat) ? `<div class="dash-perso__rendu" data-rendu-perso role="img" aria-label="${echap(etat.nom)}, ${echap(etat.classe)}"></div>`
            : `<div class="dash-perso__embleme">${echap(initiales(etat.classe))}</div>`}
          <div class="dash-perso__classe">${echap(etat.classe || "Classe non choisie")}</div>
          <div class="dash-perso__niveau">Niveau <b>${niv || "?"}</b></div>
          ${lookPerso(etat) ? apparence(etat) : ""}
        </div>
        <div class="card dash-liste">
          <div class="dash__label">Mes personnages</div>
          ${compte.persos.map((p) => {
            const b = bilan(p, gP);
            return `<button type="button" class="dash-liste__perso ${p.id === etat.id ? "is-actif" : ""}" data-dash-perso="${p.id}">
              ${mini(p)}
              <span class="dash-liste__nom">${echap(p.nom)}<small>${echap(p.classe || "Sans classe")}${p.niveau ? " · niv. " + echap(p.niveau) : ""}</small></span>
              <span class="dash-liste__pct">${pct(b.etapesFaites, b.etapes)} %</span>
            </button>`;
          }).join("")}
          <button type="button" class="btn btn--small btn--ghost" data-dash="persos">Gérer mes personnages</button>
        </div>
        ${compteVisible ? `<div class="card dash-compte">
          <div class="dash__label">Compte</div>
          <p>${connecte ? "Ta progression est synchronisée en ligne." : "Connecte-toi pour retrouver tes personnages sur tous tes appareils."}</p>
          <button type="button" class="btn btn--small ${connecte ? "" : "btn--accent"}" data-dash="compte">${connecte ? "Mon compte" : "Se connecter"}</button>
        </div>` : ""}
      </aside>

      <div class="dash__main">
        <div class="card dash-entete">
          <div>
            <p class="hero__kicker">Tableau de bord</p>
            <h1>${echap(etat.nom)}</h1>
            <p class="dash-entete__sous">${echap(etat.classe || "Classe non choisie")} · niveau ${niv || "non renseigné"} · ${compte.persos.length} personnage${compte.persos.length > 1 ? "s" : ""}</p>
          </div>
          <div class="dash-entete__actions">
            <button type="button" class="btn btn--accent" data-continuer="${etat.guide}">Continuer le guide</button>
            <button type="button" class="btn" data-dash="overlay">Ouvrir l'overlay</button>
          </div>
        </div>

        <div class="card dash-tuiles">
          ${tuile("Étapes du guide", bP.etapesFaites, bP.etapes, ICONES.etapes)}
          ${tuile("Succès et quêtes", bP.itemsFaits, bP.items, ICONES.succes)}
          ${tuile("Avis de recherche", bA.itemsFaits, bA.items, ICONES.avis)}
          ${tuile("Archimonstres", bR.archisPris, bR.archis, ICONES.archis)}
        </div>

        <div class="dash__grille">
          <div class="card dash-bloc">
            <div class="dash__label">Progression globale</div>
            <div class="dash-global">
              <div class="anneau" style="--p:${global}">
                <div class="anneau__centre"><b>${global} %</b><span>global</span></div>
              </div>
              <div class="dash-global__barres">
                ${barre("Niveau", niv, 200)}
                ${barre("Guide de progression", bP.etapesFaites, bP.etapes)}
                ${barre("Succès et quêtes", bP.itemsFaits, bP.items)}
                ${barre("Avis de recherche", bA.itemsFaits, bA.items)}
                ${barre("Archimonstres", bR.archisPris, bR.archis)}
                ${window.Pages ? barre("Dofus terminés", window.Pages.DOFUS.dofus.filter((d) => window.Pages.bilanDofus(d, window.Pages.faites()).p === 100).length, window.Pages.DOFUS.dofus.length) : ""}
              </div>
            </div>
          </div>
          <div class="card dash-bloc">
            <div class="dash__label">Activité récente</div>
            ${journal.length ? `<ul class="activite">${journal.map((j) => `<li>
              <span class="activite__point"></span>
              <span class="activite__texte">${echap(j.titre)}<small>${echap(j.type || "")}</small></span>
              <span class="activite__date">${depuis(j.date)}</span></li>`).join("")}</ul>`
              : `<p class="dash__vide">Coche une étape ou une quête : elle apparaîtra ici.</p>`}
          </div>
        </div>

        <div class="card dash-bloc">
          <div class="dash__label">Reprendre où tu en étais</div>
          <div class="reprendres">${reprendre}</div>
        </div>
      </div>`;    montrerRendu();
  }


  // Deux pages : tableau de bord (par défaut) et guides (#guide).
  const PAGES = ["dofus", "almanax", "encyclopedie"];
  function afficherVue() {
    const [h, param] = location.hash.slice(1).split("/");
    const vue = ["guide", "archimonstres", ...PAGES].includes(h) ? h : "accueil";
    const guide = vue === "guide";
    const page = PAGES.includes(vue);
    $("#vue-guide").hidden = !guide;
    $("#vue-archis").hidden = vue !== "archimonstres";
    $("#vue-accueil").hidden = vue !== "accueil";
    $("#vue-pages").hidden = !page;
    document.querySelectorAll("[data-lien-vue]").forEach((a) => a.classList.toggle("is-active", a.dataset.lienVue === vue));
    document.querySelectorAll(".nav__outils[open]").forEach((d) => d.removeAttribute("open"));
    if (page) { window.Pages?.afficher(vue, param); return; }
    window.Pages?.cacher();
    if (vue === "archimonstres") { rendreArchis(); window.scrollTo(0, 0); return; }
    if (guide) {
      rendrePage();
      requestAnimationFrame(() => {
        const el = document.querySelector(".step.is-current");
        if (el && index(etat.courante) > 0) el.scrollIntoView({ block: "center" });
      });
    } else {
      rendreAccueil();
      window.scrollTo(0, 0);
    }
  }
  window.addEventListener("hashchange", afficherVue);
  window.addEventListener("guide:compte", rendreAccueil);

  function toutRendre() {
    rendrePage();
    rendreAccueil();
    rendreArchis();
    window.Pages?.rendre();
    rendreOverlay();
  }

  // Projecteur des cartes : la lumière suit la souris (voir .card::after dans css/style.css).
  document.addEventListener("pointermove", (ev) => {
    const c = ev.target.closest?.(".card");
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", `${ev.clientX - r.left}px`);
    c.style.setProperty("--my", `${ev.clientY - r.top}px`);
  }, { passive: true });

  // Petite interface pour js/compte.js (comptes en ligne).
  window.GuideDofus = {
    compte: () => JSON.parse(JSON.stringify(compte)),
    remplacer(nouveau) {
      compte.persos = nouveau.persos.map((p) => nouveauPerso(p.nom, p.classe, p));
      const actif = compte.persos.find((p) => p.id === nouveau.actif) || compte.persos[0];
      changerPerso(actif.id);
    },
    // Progression reçue d'un autre appareil : on remplace sans réenregistrer (pas de ping-pong) ni message.
    synchroniser(nouveau) {
      compte.persos = nouveau.persos.map((p) => nouveauPerso(p.nom, p.classe, p));
      etat = compte.persos.find((p) => p.id === etat.id) || compte.persos.find((p) => p.id === nouveau.actif) || compte.persos[0];
      compte.actif = etat.id;
      G = ONGLETS.find((g) => g.id === etat.guide) || GUIDES[0];
      chargerGuide(G.id);
      try { localStorage.setItem(CLE, JSON.stringify(compte)); } catch { /* stockage indisponible */ }
      rendrePersos(); toutRendre();
    },
    toast,
    etat: () => etat,
    sauver: () => { sauver(); rendreAccueil(); },
    noter,
    quetesGuide: () => quetesGuide(),
  };

  if (MODE_OV) {
    document.documentElement.classList.add("mode-ov");
    // Design propre à l'appli (n'affecte pas le site).
    document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="css/appli.css?v=6">`);
    appliquerPrefsOv();
    // Poignées de redimensionnement sur les bords et les coins (fenêtre sans cadre).
    const DIRS = { n: "North", s: "South", e: "East", w: "West", ne: "NorthEast", nw: "NorthWest", se: "SouthEast", sw: "SouthWest" };
    document.body.insertAdjacentHTML("beforeend", Object.keys(DIRS).map((d) => `<div class="ov-poignee ov-poignee--${d}" data-resize="${DIRS[d]}"></div>`).join(""));
    document.addEventListener("mousedown", (ev) => {
      const p = ev.target.closest?.("[data-resize]");
      if (!p || ev.button !== 0) return;
      ev.preventDefault();
      window.__TAURI_INTERNALS__?.invoke("plugin:window|start_resize_dragging", { label: "journal", value: p.dataset.resize }).catch(() => {});
    });
    document.title = "Guide Dofus · Journal";
    document.body.insertAdjacentHTML("afterbegin", `<div id="ov" class="ov"></div>`);
    overlay = window;
    appliquerOpacite(document);
    document.addEventListener("keydown", (ev) => {
      if (ev.target.matches?.("input, textarea")) return;
      if (ovQuete && (ev.key === "Escape" || ev.key === "Backspace")) { fermerQueteOverlay(); return; }
      if (ovQuete) return;
      if (ev.key === "ArrowRight") aller(1);
      if (ev.key === "ArrowLeft") aller(-1);
    });
    // Progression modifiée dans un autre onglet du site (même navigateur) : on recharge.
    window.addEventListener("storage", (ev) => { if (ev.key === CLE) location.reload(); });
  }
  chargerGuide(etat.guide);
  rendrePersos();
  try { localStorage.setItem(CLE, JSON.stringify(compte)); } catch { /* stockage indisponible */ }
  toutRendre();
  afficherVue();
})();
