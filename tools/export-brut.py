"""Convertit un skin et une pose de squelette Dofus 3 en JSON compacts pour le rendu web."""
import sys, os, json, struct, warnings
warnings.filterwarnings("ignore")
import UnityPy, UnityPy.config as C
C.FALLBACK_UNITY_VERSION = "2022.3.20f1"

def r(x, n=3):
    return round(x, n)

def load(path):
    env = UnityPy.load(path)
    monos, textures, texts = [], {}, {}
    for obj in env.objects:
        t = obj.type.name
        if t == 'MonoBehaviour':
            monos.append((obj.path_id, obj.read_typetree()))
        elif t == 'Texture2D':
            textures[obj.path_id] = obj.read()
        elif t == 'TextAsset':
            d = obj.read()
            s = d.m_Script
            textures  # noqa
            texts[obj.path_id] = (d.m_Name, s.encode('utf-8', 'surrogateescape') if isinstance(s, str) else bytes(s))
    return monos, textures, texts

def skin_json(tree, tex_names):
    V = []
    for v in tree['vertices']:
        V += [r(v['pos']['x'], 2), r(v['pos']['y'], 2), r(v['uv']['x'], 5), r(v['uv']['y'], 5)]
    parts = {}
    for p in tree['m_values']:
        dl = []
        for e in p['DisplayListEntry']:
            t = e['transform']
            dl.append([e['symbolId'], r(t['rX'], 4), r(t['rY'], 4), r(t['uX'], 4), r(t['uY'], 4), r(t['tX'], 3), r(t['tY'], 3)])
        ch = [[c['startIndexIndex'], c['indexCount'], c['textureIndex'], c['startVertexIndex']] for c in p['skinChunks']]
        parts[p['name']] = {'dl': dl, 'ch': ch}
    return {'syms': tree['referencedSymbols'], 'parts': parts, 'V': V, 'I': tree['triangles'], 'tex': tex_names}

def anim_frames(b):
    """Images d'une animation. Chaque enregistrement : profondeur u16, drapeaux u16, puis
    0x20/0x01 : clip i16, noeud u16, sous-image u16, u16 ; 0x10 : matrice 6 flottants ; 0x04 : couleur u32.
    0x01 = masque ; sans 0x10 la matrice de l'image précédente est conservée ; drapeaux 0 = case vide."""
    nf, mx, _, _ = struct.unpack_from('<4H', b, 0)
    offs = list(struct.unpack_from(f'<{nf}I', b, 8)) + [len(b)]
    frames, etat = [], {}
    for i in range(nf):
        o, end, recs = offs[i], offs[i + 1], []
        while o < end:
            depth, f = struct.unpack_from('<HH', b, o); o += 4
            if f == 0:
                etat.pop(depth, None); continue
            prev = etat.get(depth, {})
            cur = dict(prev)
            if f & 0x21:
                clip, node, sub, _ = struct.unpack_from('<hHHH', b, o); o += 8
                cur.update(clip=clip, node=node, sub=sub, mask=bool(f & 1))
            if f & 0x10:
                m00, m01, m02, m10, m11, m12 = struct.unpack_from('<6f', b, o); o += 24
                cur['m'] = [r(m00, 4), r(m10, 4), r(m01, 4), r(m11, 4), r(m02, 3), r(m12, 3)]  # a b c d tx ty
            if f & 0x04:
                cur['col'] = struct.unpack_from('<I', b, o)[0]; o += 4
            etat[depth] = cur
        for depth in sorted(etat):
            c = etat[depth]
            if c.get('mask') or 'm' not in c or c.get('node') is None: continue
            recs.append([c['node'], c.get('sub', 0)] + c['m'] + ([c['col']] if 'col' in c else []))
        frames.append(recs)
    return frames

if __name__ == '__main__':
    mode, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    monos, textures, texts = load(src)
    if mode == 'skin':
        for pid, tree in monos:
            if 'vertices' in tree and tree.get('m_Name'):
                names = []
                for i, tref in enumerate(tree['textures']):
                    tx = textures[tref['m_PathID']]
                    fn = f"{tree['m_Name']}_{i}.png"
                    tx.image.save(os.path.join(out, fn))
                    names.append(fn)
                json.dump(skin_json(tree, names), open(os.path.join(out, tree['m_Name'] + '.json'), 'w'), separators=(',', ':'))
                print('skin', tree['m_Name'])
    else:  # bone: name of animation to export
        anim = sys.argv[4]
        defn = next(t for _, t in monos if 'exposedNodeNames' in t)
        bone_skin = next((t for p, t in monos if p == defn['boneAsset']['m_PathID']), None)
        by_id = {pid: (n, b) for pid, (n, b) in texts.items()}
        res = {'nodes': defn['exposedNodeNames'], 'anims': {}}
        for a in defn['animations']:
            if anim in a['name']:
                n, b = by_id[a['data']['m_PathID']]
                res['anims'][a['name']] = anim_frames(b)
        if bone_skin:
            names = []
            for i, tref in enumerate(bone_skin['textures']):
                tx = textures[tref['m_PathID']]
                fn = f"{defn['m_Name']}_{i}.png"
                tx.image.save(os.path.join(out, fn)); names.append(fn)
            res['skin'] = skin_json(bone_skin, names)
            res['graphics'] = [g['part']['name'] for g in defn['graphics']]
        json.dump(res, open(os.path.join(out, defn['m_Name'] + '.json'), 'w'), separators=(',', ':'))
        print('bone', defn['m_Name'], list(res['anims']))
