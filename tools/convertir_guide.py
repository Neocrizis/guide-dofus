"""Convertit l'onglet principal du guide Excel de Skyzio en data/guide.js.

Usage : python3 tools/convertir_guide.py chemin/vers/guide.xlsx [nom_onglet]
"""
import json, re, sys
from pathlib import Path
import openpyxl
from openpyxl.utils import column_index_from_string as ci, get_column_letter as gl

src = sys.argv[1]
wb = openpyxl.load_workbook(src)
ws = wb["Dofus 3.0"]

def txt(v):
    if v is None or isinstance(v, bool):
        return None
    s = str(v).strip()
    if isinstance(v, float) and v.is_integer():
        s = str(int(v))
    return None if s in ("", "-", "↓", "➡️") else s

# Colonnes des classes (ligne 2) et fusions qui couvrent plusieurs classes
classes = {}
for c in range(ci("AA"), ws.max_column + 1):
    v = txt(ws.cell(2, c).value)
    if v:
        classes[c] = v
span = {}
for m in ws.merged_cells.ranges:
    if m.min_col >= ci("AA"):
        span[(m.min_row, m.min_col)] = range(m.min_col, m.max_col + 1)

def is_sep(r):
    return any(ws.cell(r, ci(col)).value == "↓" for col in ("G", "H", "I"))

blocks, cur = [], []
for r in range(5, ws.max_row + 1):
    if is_sep(r):
        if cur:
            blocks.append(cur)
        cur = []
        continue
    if any(ws.cell(r, c).value is not None for c in range(1, ws.max_column + 1)):
        cur.append(r)
if cur:
    blocks.append(cur)

COLS = {"tourDuMonde": "O", "tornade": "Q", "donjons": "S", "sorts": "U", "idoles": "W", "equipements": "Y"}
steps, niveau = [], ""
for rows in blocks:
    get = lambda col: [t for r in rows if (t := txt(ws.cell(r, ci(col)).value))]
    for r in rows:
        if (t := txt(ws.cell(r, 1).value)):
            niveau = t
    e, g, i = get("E"), get("G"), get("I")
    titre, details = None, []
    if e:
        lignes = e[0].split("\n")
        titre, reste = lignes[0].strip(), "\n".join(lignes[1:]).strip()
        if reste:
            details.append(reste)
        details += e[1:]
        details += g + i
    elif g:
        lignes = g[0].split("\n")
        titre, reste = lignes[0].strip(), "\n".join(lignes[1:]).strip()
        if reste:
            details.append(reste)
        details += g[1:] + i
    elif i:
        titre, details = i[0].split("\n")[0], i[1:]
    if not titre:
        continue
    succes = []
    for r in rows:
        t = txt(ws.cell(r, ci("M")).value) or txt(ws.cell(r, ci("L")).value)
        if t and t not in succes:
            succes.append(t)
    conseils = {}
    for r in rows:
        for c in classes:
            t = txt(ws.cell(r, c).value)
            if t:
                for cc in span.get((r, c), [c]):
                    if cc in classes:
                        conseils.setdefault(classes[cc], []).append(t)
    step = {
        "id": f"e{len(steps)+1}",
        "niveau": niveau,
        "titre": titre,
        "details": details,
        "infos": get("C"),
        "succes": succes,
    }
    for k, col in COLS.items():
        v = get(col)
        if v:
            step[k] = v
    if conseils:
        step["classes"] = conseils
    steps.append(step)

version = txt(ws["C1"].value) or ""
guides = [{
    "id": "progression",
    "titre": "Progression Optimisée",
    "description": "Toutes les quêtes du jeu dans l'ordre, du niveau 1 à 200.",
    "auteur": "Skyzio",
    "version": re.sub(r".*:\s*", "", version),
    "classes": list(classes.values()),
    "etapes": steps,
}]


def premiere_ligne(t):
    lignes = t.split("\n")
    return lignes[0].strip(), "\n".join(lignes[1:]).strip()


# ---------- Dofus des Glaces : une étape par zone de Frigost ----------
wg = wb["Dofus des Glaces"]
CATS = [("D", "Série principale"), ("G", "Rescapés"), ("J", "Agriculture"), ("K", "Alchimie"),
        ("N", "Donjons"), ("Q", "Annexe")]
zones, cur = [], None
for r in range(2, wg.max_row + 1):
    z = txt(wg.cell(r, 1).value)
    if z:
        cur = {"zone": z, "rows": []}
        zones.append(cur)
    if cur:
        cur["rows"].append(r)
etapes_ddg = []
avant = [r for r in range(2, zones[0]["rows"][0])]
for zi, zb in enumerate(zones):
    rows = (avant if zi == 0 else []) + zb["rows"]
    succes, details, donjons = [], [], []
    for r in rows:
        d = txt(wg.cell(r, 2).value)
        if d:
            donjons.append(d)
        for col, label in CATS:
            v = wg.cell(r, ci(col)).value
            t = txt(v)
            if not t or str(v).startswith("="):
                continue
            nom, note = premiere_ligne(t)
            voisin = wg.cell(r, ci(col) + 1).value
            if isinstance(voisin, str) and voisin.startswith("="):
                details.append(f"Série « {nom} »" + (f" : {note}" if note else ""))
                continue
            succes.append(f"{label} : {nom}")
            if note:
                details.append(f"{nom} : {note}")
    etapes_ddg.append({
        "id": f"g{zi+1}", "niveau": "", "titre": zb["zone"], "details": details,
        "infos": [], "succes": succes, **({"donjons": donjons} if donjons else {}),
    })
guides.append({
    "id": "glaces",
    "titre": "Dofus des Glaces",
    "description": "Les quêtes de Frigost nécessaires au Dofus des Glaces, zone par zone.",
    "auteur": "Skyzio", "version": "3.0", "classes": [], "etapes": etapes_ddg,
})

# ---------- Avis de recherche : une étape par succès ----------
wa = wb["Avis de recherche"]
etapes_ar, cur, milice = [], None, None
for r in range(3, wa.max_row + 1):
    nom = txt(wa.cell(r, 3).value)
    if not nom:
        continue
    a = txt(wa.cell(r, 1).value)
    if a or cur is None:
        cur = {"id": f"a{len(etapes_ar)+1}", "niveau": "", "titre": a or "Avis divers",
               "details": [], "infos": [], "succes": []}
        etapes_ar.append(cur)
    m = txt(wa.cell(r, 5).value)
    if m:
        m = re.sub(r"\s*\n\s*", " ", m)
        if m not in cur["details"]:
            cur["details"].append(f"Milice : {m}")
    niv = txt(wa.cell(r, 2).value) or "?"
    zone = txt(wa.cell(r, 6).value) or ""
    gain = txt(wa.cell(r, 7).value)
    unite = "alitons" if r > 66 else "doplons"
    leg = " · légendaire" if wa.cell(r, 4).value is True else ""
    cur["succes"].append(f"{nom} (niv. {niv}{leg}) · {zone}" + (f" · {gain} {unite}" if gain else ""))
for e in etapes_ar:
    e["details"] = [d.replace("Milice : Milice : ", "Milice : ") for d in e["details"]]
guides.append({
    "id": "avis",
    "titre": "Avis de recherche",
    "description": "Tous les avis de recherche, leur milice, leur zone et les gains.",
    "auteur": "Skyzio", "version": "3.0", "classes": [], "etapes": etapes_ar,
})

dest = Path(__file__).resolve().parent.parent / "data" / "guide.js"
dest.parent.mkdir(exist_ok=True)
# Fichier .js (et pas .json) pour que l'appli marche aussi en ouvrant index.html directement.
dest.write_text("window.GUIDES = " + json.dumps(guides, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
for g in guides:
    print(f"{g['titre']} : {len(g['etapes'])} étapes")
