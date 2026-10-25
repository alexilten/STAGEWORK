"""
Loads the MakeHuman base body (CC0 1.0: base mesh, macro targets, default skeleton and weights) and
poses it with linear-blend skinning. Used by build_people.py; nothing from MakeHuman ships in the app,
only the meshes build_people.py derives from it.

Inputs are fetched once into MH_CACHE (default ~/.cache/stagecraft-makehuman):
  base.obj, default.mhskel, default_weights.mhw  github.com/makehumancommunity/makehuman (makehuman/data)
  targets.npz                                    the makehuman 1.3.2 wheel on PyPI
"""
import io, json, os, urllib.request, zipfile
import numpy as np

CACHE = os.environ.get('MH_CACHE', os.path.expanduser('~/.cache/stagecraft-makehuman'))
RAW = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/'
WHEEL = 'https://files.pythonhosted.org/packages/py3/m/makehuman/makehuman-1.3.2-py3-none-any.whl'

def _fetch():
    os.makedirs(CACHE, exist_ok=True)
    for rel, name in (('3dobjs/base.obj', 'base.obj'), ('rigs/default.mhskel', 'default.mhskel'), ('rigs/default_weights.mhw', 'default_weights.mhw')):
        p = os.path.join(CACHE, name)
        if not os.path.exists(p): urllib.request.urlretrieve(RAW + rel, p)
    p = os.path.join(CACHE, 'targets.npz')
    if not os.path.exists(p):
        data = urllib.request.urlopen(WHEEL).read()
        with zipfile.ZipFile(io.BytesIO(data)) as z, open(p, 'wb') as fh: fh.write(z.read('makehuman/data/targets.npz'))

def _obj():
    verts, faces, group = [], [], None
    for line in open(os.path.join(CACHE, 'base.obj')):
        if line.startswith('v '): verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('g '): group = line.split()[1]
        elif line.startswith('f ') and group == 'body':
            ix = [int(t.split('/')[0]) - 1 for t in line.split()[1:]]
            for k in range(1, len(ix) - 1): faces.append([ix[0], ix[k], ix[k + 1]])
    return np.array(verts, np.float64), np.array(faces, np.int64)

class Human:
    def __init__(self, gender=1.0, weight=0.5, muscle=0.5):
        """gender 0 female … 1 male; weight and muscle 0 … 1 (0.5 average), always a young adult"""
        _fetch()
        self.base, self.faces = _obj()
        z = np.load(os.path.join(CACHE, 'targets.npz'))
        v = self.base.copy()
        def add(name, w):
            if w <= 0: return
            idx, vec = z[f'targets/{name}.index'], z[f'targets/{name}.vector']
            v[idx] += vec * 1e-3 * w
        for sex, ws in (('male', gender), ('female', 1 - gender)):
            for eth in ('african', 'asian', 'caucasian'): add(f'macrodetails/{eth}-{sex}-young', ws / 3)
            for mus, wm in (('minmuscle', max(0, 0.5 - muscle) * 2), ('averagemuscle', 1 - abs(muscle - 0.5) * 2), ('maxmuscle', max(0, muscle - 0.5) * 2)):
                for wt, ww in (('minweight', max(0, 0.5 - weight) * 2), ('averageweight', 1 - abs(weight - 0.5) * 2), ('maxweight', max(0, weight - 0.5) * 2)):
                    if mus == 'averagemuscle' and wt == 'averageweight': continue
                    add(f'macrodetails/universal-{sex}-young-{mus}-{wt}', ws * wm * ww)
                    add(f'macrodetails/proportions/{sex}-young-{mus}-{wt}-idealproportions', ws * wm * ww)
            add(f'macrodetails/proportions/{sex}-young-averagemuscle-averageweight-idealproportions', ws * (1 - abs(muscle - 0.5) * 2) * (1 - abs(weight - 0.5) * 2))
        self.rest = v
        sk = json.load(open(os.path.join(CACHE, 'default.mhskel')))
        joint = {k: v[np.array(ix)].mean(0) for k, ix in sk['joints'].items()}
        self.bones = {}
        for name, b in sk['bones'].items():
            self.bones[name] = {'head': joint[b['head']], 'tail': joint[b['tail']], 'parent': b['parent']}
        wf = json.load(open(os.path.join(CACHE, 'default_weights.mhw')))['weights']
        self.weights = {b: (np.array([i for i, _ in w], np.int64), np.array([x for _, x in w])) for b, w in wf.items()}
        # dominant bone per vertex (for clothing regions)
        best = np.zeros(len(v)); self.owner = np.array([''] * len(v), dtype=object)
        for b, (ix, w) in self.weights.items():
            m = w > best[ix]; best[ix[m]] = w[m]; self.owner[ix[m]] = b
        self.order = []
        seen = set()
        def visit(n):
            if n in seen: return
            p = self.bones[n]['parent']
            if p: visit(p)
            seen.add(n); self.order.append(n)
        for n in self.bones: visit(n)

    def pose(self, aims=None, turns=None, curl=18.0):
        """
        aims: bone → target direction (MakeHuman frame: +Y up, +Z front, +X the figure's left);
        the bone is turned by the smallest rotation that points it there.
        turns: bone → (axis, degrees) extra rotation about the bone head, in the posed frame.
        curl: fingers close up beside the middle finger and bend this many degrees per joint
        (a relaxed hand rather than the spread rest pose).
        Returns skinned body vertices.
        """
        aims, turns = aims or {}, turns or {}
        G = {}
        for n in self.order:
            b = self.bones[n]
            P = G[b['parent']] if b['parent'] else np.eye(4)
            h = P[:3, :3] @ b['head'] + P[:3, 3]
            t = P[:3, :3] @ b['tail'] + P[:3, 3]
            R = np.eye(3)
            if curl is not None and n.startswith('finger') and not n.startswith('finger1'):
                k, seg = int(n[6]), int(n[8])
                side = n[-1]
                def world(bn, end):
                    g = G.get(bn, G[f'wrist.{side}']); return g[:3, :3] @ self.bones[bn][end] + g[:3, 3]
                mc = lambda i: world(f'metacarpal{i}.{side}', 'tail') - world(f'metacarpal{i}.{side}', 'head')
                if f'wrist.{side}' in G:
                    d = mc(k - 1) / np.linalg.norm(mc(k - 1)) * 0.4 + mc(2) / np.linalg.norm(mc(2)) * 0.6
                    across = world(f'metacarpal4.{side}', 'head') - world(f'metacarpal1.{side}', 'head')
                    nrm = np.cross(d, across) * (1 if side == 'L' else -1)
                    d = _axis(np.cross(d, nrm), np.radians(curl * seg)) @ (d / np.linalg.norm(d))
                    aims = {**aims, n: d}
            if n in aims:
                cur = (t - h) / np.linalg.norm(t - h)
                tgt = np.array(aims[n], float); tgt /= np.linalg.norm(tgt)
                R = _align(cur, tgt)
            if n in turns:
                ax, deg = turns[n]
                R = _axis(np.array(ax, float), np.radians(deg)) @ R
            L = np.eye(4); L[:3, :3] = R; L[:3, 3] = h - R @ h
            G[n] = L @ P
        out = np.zeros_like(self.rest); tot = np.zeros(len(self.rest))
        hv = np.c_[self.rest, np.ones(len(self.rest))]
        for n, (ix, w) in self.weights.items():
            M = G[n]
            out[ix] += (hv[ix] @ M.T)[:, :3] * w[:, None]
            tot[ix] += w
        free = tot < 1e-6
        out[~free] /= tot[~free][:, None]
        out[free] = self.rest[free]
        self.G = G
        return out

def _axis(a, t):
    a = a / np.linalg.norm(a); c, s = np.cos(t), np.sin(t); x, y, z = a
    return np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                     [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                     [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])

def _align(a, b):
    v = np.cross(a, b); c = float(a @ b)
    if np.linalg.norm(v) < 1e-9: return np.eye(3) if c > 0 else _axis(np.array([1.0, 0, 0]), np.pi)
    return _axis(v, np.arctan2(np.linalg.norm(v), c))
