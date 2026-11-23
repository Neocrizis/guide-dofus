"""Export allégé d'un skin Dofus 3 : seulement la direction 1, maillages compactés, atlas recadré en WebP.
Usage : python tools/export-skins.py data/persos <bundle> [<bundle> ...]"""
import sys, os, json, re, warnings
warnings.filterwarnings("ignore")
import UnityPy, UnityPy.config as C
C.FALLBACK_UNITY_VERSION = "2022.3.20f1"
DIR = "_1"
# Parties utilisées par la pose statique (direction 1).
NOEUDS = {n for n in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'persos', 'pose.json')))['noeuds']}

def exporter(path, out):
    env = UnityPy.load(path)
    textures, skin = {}, None
    for obj in env.objects:
        if obj.type.name == 'Texture2D':
            textures[obj.path_id] = obj
        elif obj.type.name == 'MonoBehaviour':
            t = obj.read_typetree()
            if 'vertices' in t and t.get('m_Name'):
                skin = t
    if not skin:
        return None
    nom = skin['m_Name']
    Vsrc, Isrc = skin['vertices'], skin['triangles']
    parts, V, I, remap = {}, [], [], {}
    uv_min = [1e9, 1e9]; uv_max = [-1e9, -1e9]
    for p in skin['m_values']:
        if not p['name'].endswith(DIR) or p['name'][:-len(DIR)] not in NOEUDS:
            continue
        ch_out = []
        for c in p['skinChunks']:
            debut = len(I)
            for k in range(c['startIndexIndex'], c['startIndexIndex'] + c['indexCount']):
                vi = c['startVertexIndex'] + Isrc[k]
                key = (vi, c['textureIndex'])
                if key not in remap:
                    v = Vsrc[vi]
                    remap[key] = len(V) // 4
                    u, w = v['uv']['x'], 1 - v['uv']['y']
                    V += [round(v['pos']['x'], 2), round(v['pos']['y'], 2), u, w]
                    uv_min = [min(uv_min[0], u), min(uv_min[1], w)]; uv_max = [max(uv_max[0], u), max(uv_max[1], w)]
                I.append(remap[key])
            ch_out.append([debut, c['indexCount']])
        dl = []
        for e in p['DisplayListEntry']:
            if e['symbolId'] == -1:
                t = e['transform']
                ident = (t['rX'], t['rY'], t['uX'], t['uY'], t['tX'], t['tY']) == (1, 0, 0, 1, 0, 0)
                dl.append(-1 if ident else [round(t['rX'], 4), round(t['rY'], 4), round(t['uX'], 4), round(t['uY'], 4), round(t['tX'], 3), round(t['tY'], 3)])
            else:
                s = skin['referencedSymbols'][e['symbolId']]
                m = re.match(r'ColorGray_(\d+)_', s)
                dl.append(int(m.group(1)) if m else 0)  # 0 = sans couleur
        parts[p['name'][:-len(DIR)]] = {'dl': dl, 'ch': ch_out}
    if not parts:
        return None
    if len(skin['textures']) > 1:
        print('  attention : plusieurs textures', nom)
    img = textures[skin['textures'][0]['m_PathID']].read().image
    W, H = img.size
    # Regroupe les sommets par morceau, découpe chaque zone utilisée de l'atlas et les range sur des étagères.
    zones = []  # (indices de sommets, rect source)
    vu = set()
    for part in parts.values():
        for debut, nb in part['ch']:
            ids = sorted(set(I[debut:debut + nb]) - vu)
            if not ids:
                continue
            vu.update(ids)
            us = [V[i * 4 + 2] * W for i in ids]; ws = [V[i * 4 + 3] * H for i in ids]
            rect = (max(0, int(min(us)) - 2), max(0, int(min(ws)) - 2), min(W, int(max(us)) + 3), min(H, int(max(ws)) + 3))
            zones.append((ids, rect))
    from PIL import Image
    largeur = 1024
    ordre = sorted(range(len(zones)), key=lambda z: -(zones[z][1][3] - zones[z][1][1]))
    x = y = h_etagere = 0; places = {}
    for z in ordre:
        x0, y0, x1, y1 = zones[z][1]; w, h = x1 - x0, y1 - y0
        if x + w > largeur:
            x, y, h_etagere = 0, y + h_etagere, 0
        places[z] = (x, y); x += w; h_etagere = max(h_etagere, h)
    hauteur = y + h_etagere
    atlas = Image.new('RGBA', (largeur, max(1, hauteur)))
    for z, (ids, (x0, y0, x1, y1)) in enumerate(zones):
        px, py = places[z]
        atlas.paste(img.crop((x0, y0, x1, y1)), (px, py))
        for i in ids:
            V[i * 4 + 2] = round((V[i * 4 + 2] * W - x0 + px) / largeur, 5)
            V[i * 4 + 3] = round((V[i * 4 + 3] * H - y0 + py) / hauteur, 5)
    atlas.save(os.path.join(out, f'{nom}.webp'), 'WEBP', quality=88, method=6)
    cw, chh = atlas.size
    json.dump({'parts': parts, 'V': V, 'I': I}, open(os.path.join(out, f'{nom}.json'), 'w'), separators=(',', ':'))
    return nom, len(parts), len(V) // 4, (cw, chh)

if __name__ == '__main__':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    for p in sys.argv[2:]:
        try:
            print(os.path.basename(p), exporter(p, out))
        except Exception as e:
            print(os.path.basename(p), 'ERREUR', e)
