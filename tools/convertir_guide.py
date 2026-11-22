"""Convertit l'onglet principal du guide Excel de Skyzio en data/guide.js.

Usage : python3 tools/convertir_guide.py chemin/vers/guide.xlsx [nom_onglet]
"""
import json, re, sys
from pathlib import Path
import openpyxl
from openpyxl.utils import column_index_from_string as ci, get_column_letter as gl

src = sys.argv[1]
onglet = sys.argv[2] if len(sys.argv) > 2 else "Dofus 3.0"
wb = openpyxl.load_workbook(src)
ws = wb[onglet]

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
out = {
    "titre": "Guide de Progression Optimisée",
    "auteur": "Skyzio",
    "version": re.sub(r".*:\s*", "", version),
    "classes": list(classes.values()),
    "etapes": steps,
}
dest = Path(__file__).resolve().parent.parent / "data" / "guide.js"
dest.parent.mkdir(exist_ok=True)
# Fichier .js (et pas .json) pour que l'appli marche aussi en ouvrant index.html directement.
dest.write_text("window.GUIDE = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
print(f"{len(steps)} étapes écrites dans {dest}")
