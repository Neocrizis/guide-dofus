"""Relie chaque étape du guide Skyzio aux passages des guides détaillés (data/guides-detailles).

Pour chaque étape, on prend les quêtes de ses succès (data/quetes.js, identifiants DofusDB) et on
cherche les étapes des guides détaillés qui les mentionnent. Le résultat (data/guides-detailles/liens.js)
donne, par étape du guide, le guide détaillé et la plage d'étapes à suivre.

Usage : python3 tools/lier_guides_detailles.py
"""
import json, re, pathlib

RACINE = pathlib.Path(__file__).resolve().parent.parent

def charger_js(chemin, nom):
    t = (RACINE / chemin).read_text(encoding="utf-8")
    debut = t.index("window.%s" % nom)
    t = t[t.index("=", debut) + 1:].strip().rstrip(";")
    return json.loads(t)

def main():
    guides = charger_js("data/guide.js", "GUIDES")
    liens_quetes = charger_js("data/quetes.js", "QUETES")["liens"]
    index = json.loads((RACINE / "data/guides-detailles/index.json").read_text(encoding="utf-8"))
    # quête -> [(guide, numéro d'étape)]
    ou = {}
    for g in index:
        d = json.loads((RACINE / g["fichier"]).read_text(encoding="utf-8"))
        for i, s in enumerate(d["steps"], 1):
            for q in set(re.findall(r'type="quest"[^>]*dofusdbid="(\d+)"', s.get("web_text") or "")):
                ou.setdefault(int(q), []).append((g["id"], i))
    infos = {g["id"]: g for g in index}
    sortie = {}
    for e in guides[0]["etapes"]:
        ids = []
        for s in e.get("succes", []):
            ids += liens_quetes.get(s) or liens_quetes.get(re.sub(r"^[^:]+ : ", "", s)) or []
        par_guide = {}
        for q in ids:
            for gid, n in ou.get(q, []):
                par_guide.setdefault(gid, []).append(n)
        res = []
        for gid, ns in sorted(par_guide.items(), key=lambda x: -len(x[1])):
            if len(ns) < 3:  # trop peu de quêtes en commun : pas un vrai passage
                continue
            res.append({"guide": gid, "nom": infos[gid]["name"], "auteur": infos[gid]["auteur"], "de": min(ns), "a": max(ns)})
        if res:
            sortie[e["id"]] = res
    # Étapes successives dans le même guide : la suivante commence où la précédente s'arrête (pas de recouvrement).
    (RACINE / "data/guides-detailles/liens.js").write_text(
        "// Généré par tools/lier_guides_detailles.py : étape du guide -> passages des guides détaillés.\n"
        "window.LIENS_DETAILLES = " + json.dumps(sortie, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(len(sortie), "étapes reliées :", ", ".join(f"{k} ({v[0]['de']}-{v[0]['a']})" for k, v in sortie.items()))

main()
