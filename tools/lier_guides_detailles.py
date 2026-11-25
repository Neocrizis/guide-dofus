"""Relie chaque étape du guide Skyzio aux passages des guides détaillés (data/guides-detailles).

Pour chaque étape, on prend les quêtes de ses succès (data/quetes.js, identifiants DofusDB) et on
cherche les étapes des guides détaillés qui les mentionnent. Le résultat (data/guides-detailles/liens.js)
donne, par étape du guide, le guide détaillé et la plage d'étapes à suivre.

Usage : python3 tools/lier_guides_detailles.py
"""
import json, re, pathlib, unicodedata

RACINE = pathlib.Path(__file__).resolve().parent.parent

def charger_js(chemin, nom):
    t = (RACINE / chemin).read_text(encoding="utf-8")
    debut = t.index("window.%s" % nom)
    t = t[t.index("=", debut) + 1:].strip().rstrip(";")
    return json.loads(t)

# Liens posés à la main quand les quêtes ne suffisent pas (étape -> guide, de, à).
MANUEL = {
    "e22": ("gany-182", 1, 12),    # Dofus Ocre : lancer l'Éternelle Moisson chez Otomaï, astuces, Metamob
    "e102": ("gany-182", 13, 33),  # Dofus Ocre : rendre les âmes, donjon, fin de la quête et étapes d'archis
}

def main():
    guides = charger_js("data/guide.js", "GUIDES")
    liens_quetes = charger_js("data/quetes.js", "QUETES")["liens"]
    index = json.loads((RACINE / "data/guides-detailles/index.json").read_text(encoding="utf-8"))
    # quête -> [(guide, numéro d'étape)]
    ou = {}
    quetes_carte = {}
    for g in index:
        d = json.loads((RACINE / g["fichier"]).read_text(encoding="utf-8"))
        for i, s in enumerate(d["steps"], 1):
            qs = set(re.findall(r'type="quest"[^>]*dofusdbid="(\d+)"', s.get("web_text") or ""))
            if len(qs) > 4:  # carte de sommaire (liste de toutes les quêtes du guide) : pas un passage
                continue
            quetes_carte[(g["id"], i)] = {int(q) for q in qs}
            for q in qs:
                ou.setdefault(int(q), []).append((g["id"], i))
    infos = {g["id"]: g for g in index}
    noms = {int(k): v[0] for k, v in charger_js("data/quetes.js", "QUETES")["quetes"].items()}
    simple = lambda x: re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFD", x.lower()).encode("ascii", "ignore").decode()).strip()
    deja = set()  # quêtes déjà prises par une étape précédente
    derniere = {}  # guide détaillé -> dernière étape utilisée
    sortie = {}
    for e in guides[0]["etapes"]:
        ids = []
        for bloc in e.get("succes", []):
            # Une case peut lister plusieurs succès / quêtes, une par ligne.
            for s in [bloc] + [x.strip() for x in bloc.split("\n") if x.strip()]:
                ids += liens_quetes.get(s) or liens_quetes.get(re.sub(r"^[^:]+ : ", "", s)) or []
        ids = list(dict.fromkeys(ids))
        # Un succès regroupe parfois des quêtes de niveaux très différents (ex. « Ça va faire du vilain » : 10 à 200).
        # Si le texte de l'étape nomme certaines de ces quêtes, on ne garde qu'elles ; sinon on retire celles
        # déjà faites dans une étape précédente.
        texte = " " + simple(" ".join([e.get("titre", "")] + e.get("details", []) + e.get("infos", []))) + " "
        nommees = [q for q in ids if q in noms and f" {simple(noms[q])} " in texte]
        ids = nommees or [q for q in ids if q not in deja]
        deja.update(ids)
        par_guide = {}
        for q in ids:
            for gid, n in ou.get(q, []):
                par_guide.setdefault(gid, []).append(n)
        res = []
        for gid, ns in sorted(par_guide.items(), key=lambda x: -len(x[1])):
            ns = sorted(set(ns))
            # Passages groupés : on coupe là où deux mentions sont à plus de 40 étapes l'une de l'autre,
            # et on garde le groupe le plus fourni.
            groupes, cur = [], [ns[0]]
            for n in ns[1:]:
                if n - cur[-1] > 40: groupes.append(cur); cur = [n]
                else: cur.append(n)
            groupes.append(cur)
            g = max(groupes, key=len)
            # Bords du passage : on retire les cartes qui ne parlent que de quêtes d'autres étapes.
            qs_de = lambda n: quetes_carte.get((gid, n), set())
            de, a = g[0], g[-1]
            while de < a and qs_de(de) and not (qs_de(de) & set(ids)): de += 1
            while a > de and qs_de(a) and not (qs_de(a) & set(ids)): a -= 1
            g = [x for x in g if de <= x <= a] or [de]
            g[0], g[-1] = de, a
            if len(g) < min(3, len(ids)) or (res and len(g) < 3):  # trop peu de mentions : pas un vrai passage
                continue
            res.append({"guide": gid, "nom": infos[gid]["name"], "auteur": infos[gid]["auteur"], "de": g[0], "a": g[-1]})
        if e["id"] in MANUEL:
            gid, de, a = MANUEL[e["id"]]
            res = [{"guide": gid, "nom": infos[gid]["name"], "auteur": infos[gid]["auteur"], "de": de, "a": a}]
        # Pas de recouvrement avec l'étape précédente dans le même guide : on reprend où elle s'arrêtait.
        for r in res:
            fin = derniere.get(r["guide"])
            if fin and r["de"] < fin < r["a"]:
                r["de"] = fin
            derniere[r["guide"]] = max(r["a"], derniere.get(r["guide"], 0))
        if res:
            sortie[e["id"]] = res
    # Étapes successives dans le même guide : la suivante commence où la précédente s'arrête (pas de recouvrement).
    (RACINE / "data/guides-detailles/liens.js").write_text(
        "// Généré par tools/lier_guides_detailles.py : étape du guide -> passages des guides détaillés.\n"
        "window.LIENS_DETAILLES = " + json.dumps(sortie, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(len(sortie), "étapes reliées :", ", ".join(f"{k} ({v[0]['de']}-{v[0]['a']})" for k, v in sortie.items()))

main()
