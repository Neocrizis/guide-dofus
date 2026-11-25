"""Convertit les guides Ganymède (fichiers JSON de l'appli, dossier %APPDATA%/com.ganymede.ganymede-app/guides)
en guides détaillés du site : data/guides-detailles/gany-<id>.json + index.json.

Les captures hébergées par Ganymède sont remplacées par des copies locales (img/guides/ganymede/<nom>.webp) ;
la liste des captures à récupérer est écrite dans img/guides/ganymede/a-telecharger.txt.
Réutilisation autorisée par l'équipe Ganymède (Pynx, Discord, 24/11/2026), usage non commercial, auteurs crédités.

Usage : python3 tools/convertir_ganymede.py <dossier des guides>
"""
import json, re, sys, pathlib, html

RACINE = pathlib.Path(__file__).resolve().parent.parent
SORTIE = RACINE / "data/guides-detailles"
IMAGES = RACINE / "img/guides/ganymede"
EXCLUS = {1074}  # mode d'emploi de l'appli Ganymède
STOCKAGE = re.compile(r"https://ganymede-app\.com/storage/guides/([0-9a-f]{64}\.webp)")
ICONES = re.compile(r'<img src="https://ganymede-app\.com/images/[^"]*"[^>]*>')

def texte(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h or ""))).strip()

def auteur(desc):
    t = texte(desc)
    m = re.search(r"(?:écrit|rédigé|commencé)[^.]*?par\s+(.+?)(?:\s*\(|\.|\s+de la guilde|Notes|Ce guide|$)", t, re.I)
    if m:
        return "Guide de " + m.group(1).strip().rstrip(",")
    return "Guide de l'équipe Ganymède"

def main(dossier):
    images, index = set(), []
    for f in sorted(pathlib.Path(dossier).glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        if d["id"] in EXCLUS or d.get("deleted_at"):
            continue
        gid = f"gany-{d['id']}"
        etapes = []
        for s in d["steps"]:
            t = s.get("web_text") or ""
            images.update(STOCKAGE.findall(t))
            t = STOCKAGE.sub(r"img/guides/ganymede/\1", t)
            t = ICONES.sub("", t)
            etapes.append({"name": s.get("name"), "map": s.get("map"), "pos_x": s.get("pos_x"), "pos_y": s.get("pos_y"), "web_text": t})
        g = {"id": gid, "name": d["name"], "auteur": auteur(d.get("description")), "source": "Ganymède",
             "source_url": "https://ganymede-app.com", "licence": "Réutilisé avec l'accord de l'équipe Ganymède, usage non commercial.",
             "maj": (d.get("updated_at") or "")[:10], "steps": etapes}
        (SORTIE / f"{gid}.json").write_text(json.dumps(g, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        index.append({"id": gid, "ordre": d.get("order") or 0, "name": d["name"], "auteur": g["auteur"], "source": "Ganymède",
                      "fichier": f"data/guides-detailles/{gid}.json", "etapes": len(etapes)})
    index.sort(key=lambda g: (g["ordre"] if g["ordre"] else 999, g["name"]))
    (SORTIE / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    deja = {p.name for p in IMAGES.glob("*.webp")}
    manquantes = sorted(images - deja)
    (IMAGES / "a-telecharger.txt").write_text("".join(f"https://ganymede-app.com/storage/guides/{n}\n" for n in manquantes), encoding="utf-8")
    print(len(index), "guides,", len(images), "captures dont", len(manquantes), "à télécharger")

main(sys.argv[1])
