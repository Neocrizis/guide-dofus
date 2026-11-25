"""Construit le guide principal à partir du « Guide complet Ganymède » ([GP0], gany-2747).

Chaque étape du GP0 devient une étape du guide. Ses cartes : le texte de l'étape GP0,
puis les passages des guides GP1… qu'elle demande de suivre (« Reprenez le guide X de
l'étape A jusqu'à l'étape B incluse », « Commencez et terminez le guide Y », …).
Sortie : data/guide-complet.js (remplace le guide « progression » de data/guide.js).
"""
import html, json, re
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DOSSIER = RACINE / "data" / "guides-detailles"
GP0 = "gany-2747"
# Hors du parcours demandé (GP0 à GP88) : [GP89] 100% Frigost, optionnel.
EXCLUS = {"gany-3238"}
CAMPS = {"gany-516": "bonta", "gany-773": "brakmar"}
# Tranches de niveau indiquées par les étapes « Mise à jour de l'équipement » du GP0 (approximatif).
TRANCHES = [(1, "0"), (5, "1 à 40"), (24, "40 à 60"), (42, "60 à 100"), (61, "100 à 120"),
            (80, "120 à 150"), (92, "150 à 180"), (107, "180 à 200"), (128, "200")]
TITRES = {1: "Avant de commencer", 2: "Bienvenue", 3: "À lire en entier", 4: "Comment lire le guide", 156: "Fin du guide"}
VERBE = re.compile(r"\b(commencez|reprenez|continuez|terminez|finissez)\b", re.I)

index = {g["id"]: g for g in json.loads((DOSSIER / "index.json").read_text(encoding="utf-8"))}
nb_etapes = {gid: g["etapes"] for gid, g in index.items()}
sans_gp = lambda s: re.sub(r"\[GP\d*\]\s*|\s*\(NEW\)", "", s or "").strip()


def texte(web):
    w = re.sub(r'<span[^>]*data-type="guide-step"[^>]*guideid="(\d+)"[^>]*>.*?</span>(</span>)?', r"{G\1}", web)
    w = re.sub(r"</p>|<br\s*/?>|</li>|</div>", "\n", w)
    t = html.unescape(re.sub(r"<[^>]+>", "", w)).replace("\xa0", " ")
    t = re.sub(r"\d️?⃣", "", t)  # renvois d'astuce 1️⃣ collés aux numéros d'étape
    return [l.strip() for l in t.split("\n") if l.strip()]


def plage(ligne, gid, pos):
    """(de, a) du passage demandé par la ligne pour le guide gid, ou None."""
    fin = nb_etapes[gid]
    apres = ligne.split("{G" + gid[5:] + "}", 1)[1]
    clause = re.split(r"\.(\s|$)", apres, maxsplit=1)[0]
    avant = ligne.split("{G" + gid[5:] + "}", 1)[0]
    m = re.search(r"de l'étapes? (\d+) (?:jusqu'à|à) l'étape (\d+)", clause)
    if m:
        return int(m[1]), int(m[2])
    m = re.search(r"(?:depuis|à partir de) l'étape (\d+)", clause)
    if m:
        return int(m[1]), fin
    if re.search(r"commencez et terminez", avant, re.I) or re.search(r"\bterminez[- ]le\b", clause, re.I):
        return 1, fin
    m = re.search(r"jusqu'à l'étape (\d+)", clause)
    if m:
        b = int(m[1]) - (1 if re.search(r"SANS la faire", clause) else 0)
        return (1 if re.search(r"commencez", avant, re.I) else pos + 1), b
    m = re.search(r"à l'étape (\d+)", clause)
    if m and re.search(r"reprenez|continuez", avant, re.I):
        return int(m[1]), int(m[1])
    if re.search(r"terminez|finissez", avant, re.I):
        return pos + 1, fin
    return None


def titre(n, lignes):
    if n in TITRES:
        return TITRES[n]
    if lignes and "bonus" in lignes[0].lower():
        sujets = [re.sub(r"[^\w/&'’ -]", "", l).strip(" -") for l in lignes[1:4] if re.match(r"^\W", l) and "Q&A" not in l]
        return "Bonus : " + ", ".join(s for s in sujets if s)
    m = re.match(r"Objectifs? ?: ?(.+?)\.?$", lignes[0]) if lignes else None
    return m[1] if m else (lignes[0][:80] if lignes else f"Étape {n}")


def main():
    gp0 = json.loads((DOSSIER / f"{GP0}.json").read_text(encoding="utf-8"))
    pos = {}
    etapes = []
    for n, s in enumerate(gp0["steps"], 1):
        if n == 1:
            continue  # page de crédits (crédit repris sous chaque étape du site)
        lignes = texte(s["web_text"])
        liens = [{"guide": GP0, "de": n, "a": n}]
        astuces = False
        for l in lignes:
            if re.match(r"Astuces? ?:", l) or l.startswith(("Q :", "A :")):
                astuces = True
            ids = [f"gany-{g}" for g in re.findall(r"\{G(\d+)\}", l)]
            if astuces or not ids:
                continue
            seul = re.fullmatch(r"\{G\d+\}", l)  # liste de guides à faire en entier (« les 4 guides suivants »)
            for gid in dict.fromkeys(ids):
                if gid not in index or gid == GP0 or gid in EXCLUS:
                    continue
                avant = l.split("{G" + gid[5:] + "}", 1)[0]
                if not seul and (not VERBE.search(avant) or re.search(r"combinez|capturez|félicitations|lisez", avant, re.I)):
                    continue
                p = pos.get(gid, 0)
                r = (1, nb_etapes[gid]) if seul else plage(l, gid, p)
                if not r:
                    continue
                de, a = r
                a = min(a, nb_etapes[gid])
                if de <= p < a:
                    de = p + 1  # carte déjà vue à l'étape précédente
                if de > a:
                    continue
                pos[gid] = max(p, a)
                lien = {"guide": gid, "de": de, "a": a}
                if gid in CAMPS:
                    lien["camp"] = CAMPS[gid]
                if "(Optionnel)" in l:
                    lien["optionnel"] = True
                liens.append(lien)
        niveau = [t for d, t in TRANCHES if n >= d][-1]
        etapes.append({"id": f"c{n}", "niveau": niveau, "titre": titre(n, lignes), "details": [], "infos": [], "succes": [], "liens": liens})
    auteurs = {gid: {"nom": sans_gp(g["name"]), "auteur": g["auteur"]} for gid, g in index.items()}
    guide = {
        "id": "progression", "titre": "Guide complet", "description": "Tout le jeu dans l'ordre, carte par carte, d'après le guide complet de l'équipe Ganymède.",
        "auteur": "Équipe Ganymède", "version": gp0.get("maj") or "", "etapes": etapes,
    }
    sortie = RACINE / "data" / "guide-complet.js"
    sortie.write_text(
        "// Généré par tools/construire_guide_complet.py : guide principal d'après le guide complet Ganymède.\n"
        "window.GUIDE_AUTEURS = " + json.dumps(auteurs, ensure_ascii=False) + ";\n"
        "(() => {\n  const g = " + json.dumps(guide, ensure_ascii=False, indent=1) + ";\n"
        "  g.classes = (window.GUIDES.find((x) => x.id === \"progression\") || {}).classes || [];\n"
        "  window.GUIDES = window.GUIDES.map((x) => (x.id === \"progression\" ? g : x));\n})();\n",
        encoding="utf-8")
    total = sum(l["a"] - l["de"] + 1 for e in etapes for l in e["liens"])
    print(len(etapes), "étapes,", total, "cartes")
    for e in etapes:
        print(e["id"], e["niveau"], "|", e["titre"][:60], "|", " ".join(f"{l['guide'][5:]}:{l['de']}-{l['a']}{'*' if l.get('camp') else ''}" for l in e["liens"][1:]))
    jamais = [gid for gid in index if gid not in pos and gid != GP0]
    print("guides jamais cités :", [index[g]["name"] for g in jamais])
    incomplets = [(index[g]["name"], pos[g], nb_etapes[g]) for g in pos if pos[g] < nb_etapes[g]]
    print("guides pas finis :", incomplets)


main()
