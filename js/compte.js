// Comptes en ligne : connexion par lien envoyé par e-mail (Supabase),
// puis synchronisation des personnages et de leur progression entre appareils.
(() => {
  "use strict";

  const cfg = window.GUIDE_DOFUS_CONFIG || {};
  const bouton = document.getElementById("compte-btn");
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase || !window.GuideDofus) {
    bouton.hidden = true; // pas configuré : le site marche sans compte
    return;
  }

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const app = window.GuideDofus;
  const dialogue = document.getElementById("compte-dialog");
  const vueConnexion = document.getElementById("compte-connexion");
  const vueConnecte = document.getElementById("compte-connecte");
  const etatSync = document.getElementById("compte-sync");
  let utilisateur = null;
  let pret = false; // vrai une fois la fusion initiale faite
  let minuteur = null;

  // Un personnage « vide » créé par défaut sur un nouvel appareil ne doit pas
  // s'ajouter aux personnages du compte.
  const estVide = (p) => !Object.keys(p.faites || {}).length && !Object.keys(p.succes || {}).length && p.nom === "Mon personnage";

  function fusionner(local, distant) {
    const parId = new Map();
    const locaux = distant.persos.length ? local.persos.filter((p) => !estVide(p)) : local.persos;
    [...distant.persos, ...locaux].forEach((p) => {
      const deja = parId.get(p.id);
      if (!deja || (p.maj || 0) > (deja.maj || 0)) parId.set(p.id, p);
    });
    const persos = [...parId.values()];
    const actif = persos.some((p) => p.id === local.actif) ? local.actif : distant.actif;
    return { persos, actif };
  }

  function afficherSync(texte) { etatSync.textContent = texte; }

  async function envoyer() {
    if (!utilisateur || !pret) return;
    afficherSync("Synchronisation…");
    const { error } = await sb.from("comptes").upsert({
      user_id: utilisateur.id, data: app.compte(), updated_at: new Date().toISOString(),
    });
    afficherSync(error ? "Échec de la synchronisation, nouvel essai à la prochaine modification." : "Progression synchronisée.");
  }

  async function demarrer(user) {
    utilisateur = user;
    pret = false;
    majInterface();
    afficherSync("Récupération de tes personnages…");
    const { data, error } = await sb.from("comptes").select("data").eq("user_id", user.id).maybeSingle();
    if (error) { afficherSync("Impossible de lire ton compte : " + error.message); return; }
    if (data?.data?.persos?.length) {
      app.remplacer(fusionner(app.compte(), data.data));
      app.toast("Personnages récupérés depuis ton compte");
    }
    pret = true;
    await envoyer();
  }

  function majInterface() {
    bouton.querySelector("span").textContent = utilisateur ? "Mon compte" : "Se connecter";
    bouton.classList.toggle("is-connecte", !!utilisateur);
    vueConnexion.hidden = !!utilisateur;
    vueConnecte.hidden = !utilisateur;
    if (utilisateur) document.getElementById("compte-email").textContent = utilisateur.email || "";
    window.dispatchEvent(new CustomEvent("guide:compte")); // met à jour le tableau de bord
  }

  // Envoi groupé : on attend 1,5 s sans modification avant d'enregistrer en ligne.
  window.addEventListener("guide:sauve", () => {
    clearTimeout(minuteur);
    minuteur = setTimeout(envoyer, 1500);
  });

  bouton.addEventListener("click", () => { majInterface(); dialogue.showModal(); });
  document.getElementById("compte-fermer").addEventListener("click", () => dialogue.close());

  document.getElementById("compte-google").addEventListener("click", async () => {
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + location.pathname },
    });
    if (error) document.getElementById("compte-message").textContent = "Connexion Google impossible : " + error.message;
  });

  document.getElementById("compte-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = document.getElementById("compte-adresse").value.trim();
    const msg = document.getElementById("compte-message");
    msg.textContent = "Envoi du lien…";
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    msg.textContent = error
      ? "L'envoi a échoué : " + error.message
      : `Lien envoyé à ${email}. Ouvre-le sur cet appareil pour te connecter.`;
  });

  document.getElementById("compte-deconnexion").addEventListener("click", async () => {
    await envoyer();
    await sb.auth.signOut();
    utilisateur = null; pret = false;
    majInterface();
    app.toast("Déconnecté. Tes personnages restent aussi dans ce navigateur.");
  });

  sb.auth.onAuthStateChange((evenement, session) => {
    const user = session?.user || null;
    // Pas d'appel Supabase directement dans ce rappel (risque de blocage) : on décale.
    if (user && user.id !== utilisateur?.id) setTimeout(() => demarrer(user), 0);
    if (!user && utilisateur) { utilisateur = null; pret = false; majInterface(); }
  });

  // Retour d'une connexion échouée (ex. Google) : on affiche l'erreur et on nettoie l'adresse.
  const params = new URLSearchParams(location.search || location.hash.slice(1));
  if (params.get("error_description")) {
    app.toast("Connexion impossible : " + params.get("error_description"));
    history.replaceState(null, "", location.pathname);
  }

  bouton.hidden = false;
  majInterface();
})();
