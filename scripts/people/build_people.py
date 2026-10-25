"""
Builds STAGECRAFT's viewport people from the CC0 MakeHuman base mesh (macro targets for gender,
weight and build, the default skeleton and its skin weights), posed by linear-blend skinning and
dressed with distance-field clothing (tee / blazer / hoodie, trousers, shoes, hair). Each figure is
re-meshed with narrow-band marching cubes, Taubin-smoothed and reduced with quadric decimation.

  pip install numpy scipy scikit-image libigl fast-simplification
  python3 scripts/people/build_people.py        # writes src/viewport/people/*.bin

The MakeHuman inputs (base mesh, targets, skeleton; all CC0) are downloaded once into
$MH_CACHE (default ~/.cache/stagecraft-makehuman). Output:
  presenter  ~36k triangles, smooth shaded: the hero figure every camera view looks at
  crowd-*    7 variants, ~700 triangles near and ~400 far, shaded flat like low-poly scan people
These meshes are viewport-only: every exporter keeps the two-cylinder proxy, so CAD files stay light.
Units are mm, Z up, origin on the floor between the feet, the figure faces −Y (toward the house).

File format (little endian): u32 vertexCount, u32 triangleCount, i16 xyz × vertexCount in 0.1 mm,
then u16 (or u32 when vertexCount > 65535) indices × 3 × triangleCount.
"""
import os, struct, sys
import numpy as np
from skimage.measure import marching_cubes
import fast_simplification

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'viewport', 'people')
F = np.float32

# ── distance primitives (p: (..., 3) arrays) ─────────────────────────────────────────
def length(v): return np.sqrt(np.sum(v * v, axis=-1))

def sphere(c, r):
    c = np.array(c, F)
    return lambda p: length(p - c) - r

def cone(a, b, ra, rb):
    """capsule whose radius runs from ra at a to rb at b (blend-friendly approximation)"""
    a, b = np.array(a, F), np.array(b, F)
    ba = b - a; bb = float(ba @ ba)
    def f(p):
        t = np.clip(((p - a) @ ba) / bb, 0, 1)[..., None]
        return length(p - (a + t * ba)) - (ra + (rb - ra) * t[..., 0])
    return f

def ellipsoid(c, r, rot=None):
    c, r = np.array(c, F), np.array(r, F)
    def f(p):
        q = p - c
        if rot is not None: q = q @ rot
        k0 = length(q / r); k1 = length(q / (r * r))
        return k0 * (k0 - 1) / np.maximum(k1, 1e-6)
    return f

def rbox(c, h, rr, rot=None):
    c, h = np.array(c, F), np.array(h, F)
    def f(p):
        q = p - c
        if rot is not None: q = q @ rot
        d = np.abs(q) - (h - rr)
        return length(np.maximum(d, 0)) + np.minimum(np.max(d, axis=-1), 0) - rr
    return f

def smin(a, b, k):
    if k <= 0: return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)

def smax(a, b, k): return -smin(-a, -b, k)

def rotz(deg):
    t = np.radians(deg); c, s = np.cos(t), np.sin(t)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], F)

def rot_to(d):
    """rotation whose columns map local +Z onto direction d (for ellipsoids along a limb)"""
    z = np.array(d, F); z /= np.linalg.norm(z)
    x = np.cross([0, 1, 0], z) if abs(z[1]) < 0.9 else np.cross([1, 0, 0], z)
    x /= np.linalg.norm(x); y = np.cross(z, x)
    return np.stack([x, y, z], axis=1).astype(F)

class Body:
    """ordered list of (op, sdf, k); evaluated left to right"""
    def __init__(self): self.ops = []
    def add(self, f, k=0): self.ops.append(('u', f, k)); return self
    def cut(self, f, k=0): self.ops.append(('s', f, k)); return self
    def group(self, other, k): self.ops.append(('g', other, k)); return self
    def __call__(self, p):
        d = None
        for op, f, k in self.ops:
            v = f(p)
            if d is None: d = v if op != 's' else -v
            elif op == 's': d = smax(d, -v, k)
            else: d = smin(d, v, k)
        return d

def lerp(a, b, t): return [a[i] + (b[i] - a[i]) * t for i in range(3)]

# ── meshing ───────────────────────────────────────────────────────────────────────────
def keep_largest(v, f):
    """drop floating bits (a stray strand of hair) so every figure is one shell"""
    import scipy.sparse as sp
    from scipy.sparse.csgraph import connected_components
    n = len(v)
    a = sp.coo_matrix((np.ones(len(f) * 3), (np.repeat(f[:, 0], 3), f.ravel())), shape=(n, n))
    a = a + sp.coo_matrix((np.ones(len(f) * 2), (np.concatenate([f[:, 1], f[:, 2]]), np.concatenate([f[:, 2], f[:, 0]]))), shape=(n, n))
    _, lab = connected_components(a, directed=False)
    big = np.bincount(lab[f[:, 0]]).argmax()
    keep = lab[f[:, 0]] == big
    f = f[keep]
    used = np.unique(f); remap = -np.ones(n, np.int64); remap[used] = np.arange(len(used))
    return v[used], remap[f]

def reduce(v, f, tris):
    r = 1 - tris / len(f)
    if r <= 0: return v, f
    v2, f2 = fast_simplification.simplify(v.astype(np.float32), f.astype(np.int32), target_reduction=r, agg=7)
    return v2.astype(np.float64), f2.astype(np.int64)

def write(name, v, f):
    os.makedirs(OUT, exist_ok=True)
    q = np.round(v * 10).astype(np.int16)
    big = len(v) > 65535
    with open(os.path.join(OUT, name + '.bin'), 'wb') as fh:
        fh.write(struct.pack('<II', len(v), len(f)))
        fh.write(q.astype('<i2').tobytes())
        fh.write(f.astype('<u4' if big else '<u2').tobytes())
    print(f'{name}: {len(v)} verts, {len(f)} tris, z {v[:, 2].min():.0f}–{v[:, 2].max():.0f} mm')


# ── dressing ───────────────────────────────────────────────────────────────────────────
import igl
from makehuman import Human

FACE = {'head', 'jaw', 'neck01', 'neck02', 'neck03', 'eye.L', 'eye.R', 'special01', 'special03', 'special04'}
HAND = ('wrist', 'metacarpal', 'finger')
FOOT = ('foot', 'toe')

def masks(H):
    own = H.owner
    m = {
        'head': np.array([o in FACE or o.startswith(('levator', 'oculi', 'orbicularis', 'oris', 'risorius', 'temporalis', 'special', 'tongue')) for o in own]),
        'hand': np.array([o.startswith(HAND) for o in own]),
        'foot': np.array([o.startswith(FOOT) for o in own]),
        'lowarm': np.array([o.startswith('lowerarm') for o in own]),
        'arm': np.array([o.startswith(('upperarm', 'shoulder', 'lowerarm')) for o in own]),
        'leg': np.array([o.startswith(('upperleg', 'lowerleg')) for o in own]),
    }
    m['body'] = ~(m['head'] | m['hand'] | m['foot'] | m['arm'] | m['leg'])
    return m

def soften(H, off, n):
    import scipy.sparse as sp
    Fm = H.faces; N = len(off)
    A = sp.coo_matrix((np.ones(Fm.size), (Fm.ravel(), np.roll(Fm, 1, axis=1).ravel())), shape=(N, N)).tocsr()
    A = ((A + A.T) > 0).astype(float)
    deg = np.asarray(A.sum(1)).ravel(); deg[deg == 0] = 1
    for _ in range(n): off = 0.5 * off + 0.5 * (A @ off) / deg
    return off

def regions(H, outfit):
    """per-vertex offset (mm, outward) of the layer worn next to the skin: shirt, trousers, shoes, hair"""
    v = H.rest; ymin, ymax = v[:, 1].min(), v[:, 1].max(); u = (v[:, 1] - ymin) / (ymax - ymin)
    eye = H.bones['eye.L']['head']
    M = masks(H)
    off = np.zeros(len(v))
    top, sleeve, shoes, hair = outfit['top'], outfit.get('sleeve', 'long'), outfit.get('shoes', 14), outfit.get('hair', 'short')
    T = {'tee': 5, 'blazer': 4, 'hoodie': 8, 'shirt': 6}[top]
    off[M['body']] = T
    off[M['arm']] = T
    if sleeve == 'short': off[M['lowarm']] = 0; off[M['arm'] & (u < 0.70)] = 0
    off[M['leg']] = 11 + np.clip((0.34 - u[M['leg']]) * 25, 0, 5)                         # straight trouser legs
    off[M['body'] & (u < 0.56)] = np.maximum(off[M['body'] & (u < 0.56)], 10)            # trouser waist and seat
    off[M['foot']] = shoes
    # hair: crown and back of the head
    hairline = eye[1] + (0.45 if hair != 'long' else 0.38)
    scalp = M['head'] & ((v[:, 1] > hairline) | ((v[:, 2] < eye[2] - 0.78) & (v[:, 1] > eye[1] - (0.55 if hair == 'short' else 0.9))))
    off[scalp] = {'short': 14, 'long': 16, 'bun': 14, 'none': 1}[hair]
    off = soften(H, off, outfit.get('soft', 4))
    off[M['hand']] = np.minimum(off[M['hand']], 1)
    return off

def dressed(H, verts, outfit, h, extras=()):
    """distance function of the posed, dressed figure in STAGECRAFT mm (Z up, facing −Y)"""
    V = np.c_[verts[:, 0], -verts[:, 2], verts[:, 1]]
    s = h / (V[:, 2].max() - V[:, 2].min()); z0 = (V[:, 2] * s).min(); V = V * s; V[:, 2] -= z0
    to_mm = lambda q: np.array([q[0], -q[2], q[1]]) * s - np.array([0, 0, z0])
    joint = lambda b, end='head': to_mm(H.G[b][:3, :3] @ H.bones[b][end] + H.G[b][:3, 3])
    F = H.faces
    used = np.unique(F); remap = -np.ones(len(V), np.int64); remap[used] = np.arange(len(used))
    V2, F2 = V[used], remap[F]
    off_v = regions(H, outfit)[used]
    M = {k: m[used] for k, m in masks(H).items()}
    sc = h / 1750
    # eyeballs close the sockets of the body mesh; a little fill behind the lips closes the mouth
    parts = [('u', sphere(list(joint('eye.L')), 13.2 * sc), 4.0), ('u', sphere(list(joint('eye.R')), 13.2 * sc), 4.0)]
    lips = (joint('oris01') + joint('oris05')) / 2 if 'oris05' in H.bones else joint('oris01')
    parts.append(('u', ellipsoid(list(lips + np.array([0, 10 * sc, -1 * sc])), [17 * sc, 7 * sc, 5 * sc]), 2.5))
    hair = outfit.get('hair', 'short')
    if hair in ('long', 'bun'):
        hb, ht = joint('head'), joint('head', 'tail')
        if hair == 'long':
            parts.append(('u', ellipsoid(list((hb + ht) / 2 + np.array([0, 72 * sc, -60 * sc])), [86 * sc, 46 * sc, 150 * sc]), 22 * sc))
        else:
            parts.append(('u', sphere(list((hb + ht) / 2 + np.array([0, 100 * sc, 40 * sc])), 42 * sc), 12 * sc))
    # a jacket: a loose shell over torso and arms that hangs straight from the chest to a level hem,
    # buttoned at the waist and open in a V above it, with the lapels rolled back
    jacket = None
    if outfit['top'] in ('blazer', 'hoodie'):
        loose = 13 if outfit['top'] == 'blazer' else 20
        jf = (M['body'] | M['arm'] | (M['leg'] & (V2[:, 2] > 0.44 * h))) & ~M['head']
        jf_face = jf[F2].all(1)
        jl_face = np.where(M['arm'][F2].any(1), (loose - 5) * sc, loose * sc)
        sh = (joint('upperarm01.L') + joint('upperarm01.R')) / 2
        pel = joint('pelvis.L') * 0 + (joint('upperleg01.L') + joint('upperleg01.R')) / 2
        hem = pel[2] - (110 if outfit['top'] == 'blazer' else 20) * sc
        button = pel[2] + 0.17 * h
        neck = joint('neck01')[2]
        body_pts = V2[M['body']]
        chest = body_pts[np.abs(body_pts[:, 2] - (sh[2] - 0.08 * h)) < 30]
        cx, cy = chest[:, 0].mean(), (chest[:, 1].min() + chest[:, 1].max()) / 2
        ax = (chest[:, 0].max() - chest[:, 0].min()) / 2 + 4 * sc
        ay = (chest[:, 1].max() - chest[:, 1].min()) / 2 + 6 * sc
        top_z = sh[2] - 0.12 * h
        def envelope(p):
            # elliptical cylinder hanging from the chest to the hem, narrowing into the chest at the top
            t = np.clip((p[..., 2] - (top_z - 120 * sc)) / (120 * sc), 0, 1)
            q = np.sqrt(((p[..., 0] - cx) / (ax * (1 - 0.25 * t))) ** 2 + ((p[..., 1] - cy) / (ay * (1 - 0.25 * t))) ** 2)
            d = (q - 1) * min(ax, ay) * 0.9
            return smax(d, np.maximum(hem - p[..., 2], p[..., 2] - top_z), 40 * sc)
        def opening_half(z):
            up = np.clip((z - button) / max(1.0, neck - 25 * sc - button), 0, 1)
            down = np.clip((button - z) / max(1.0, button - hem), 0, 1)
            return np.where(z >= button, up * 76 * sc, down * 52 * sc)
        def opening(p):
            return np.maximum(np.abs(p[..., 0] - cx) - opening_half(p[..., 2]), p[..., 1] - (cy - 30 * sc))
        def jacket(S, I, p):
            d = np.where(jf_face[I], S - jl_face[I], 1e4).astype(F32)
            d = smin(d, envelope(p), 30 * sc)
            d = smax(d, hem - p[..., 2], 4 * sc)
            if outfit['top'] == 'blazer':
                d = smax(d, -opening(p), 2 * sc)
                # lapels: a raised band along the opening above the button, rolled back toward the shoulders
                z = p[..., 2]
                w = 28 * sc * np.clip((z - button) / (160 * sc), 0, 1)
                band = np.abs(np.abs(p[..., 0] - cx) - opening_half(z) - w) - w
                lap = np.maximum(np.maximum(band, np.abs(S - (loose + 3) * sc) - 4 * sc), np.maximum(button - z, z - (neck - 10 * sc)))
                lap = np.maximum(lap, p[..., 1] - cy)
                lap = np.where(jf_face[I], lap, 1e4)
                d = np.minimum(d, lap)
            else:
                d = smin(d, ellipsoid(list(np.array([cx, cy + 60 * sc, neck + 10 * sc])), [105 * sc, 62 * sc, 40 * sc])(p), 18 * sc)  # hood down
            return d
    # shoes: a firm last round each foot
    def shoe(side):
        a = joint(f'foot.{side}'); t = joint(f'toe3-1.{side}', 'tail') if f'toe3-1.{side}' in H.bones else joint(f'foot.{side}', 'tail')
        fwd = t - a; fwd[2] = 0; L = np.linalg.norm(fwd); fwd /= L
        c = a + fwd * (L * 0.45); c[2] = 38 * sc
        yaw = np.degrees(np.arctan2(fwd[0], -fwd[1]))
        c[2] = 34 * sc
        return rbox(list(c), [45 * sc, (L * 0.62 + 30 * sc), 34 * sc], 28 * sc, rotz(-yaw).T)
    shoes = [('u', shoe('L'), 14 * sc), ('u', shoe('R'), 14 * sc)]
    # trouser legs fall straight from the knee to the shoe
    for side in 'LR':
        k, a = joint(f'lowerleg01.{side}'), joint(f'foot.{side}')
        hip = joint(f'upperleg01.{side}')
        top = hip + (k - hip) * 0.45
        shoes.append(('u', cone(list(top), list(a + np.array([0, 6 * sc, 30 * sc])), 66 * sc, 57 * sc), 36 * sc))
    def fn(p):
        P = p.reshape(-1, 3).astype(np.float64)
        S, I, C = igl.signed_distance(P, V2, F2)[:3]
        # offset interpolated at the closest point, so layers stay smooth across faces
        B = igl.barycentric_coordinates(C, V2[F2[I, 0]], V2[F2[I, 1]], V2[F2[I, 2]]) if hasattr(igl, 'barycentric_coordinates') else None
        if B is None or B.shape != (len(P), 3):
            off = off_v[F2[I]].mean(1)
        else:
            off = (off_v[F2[I]] * np.clip(B, 0, 1)).sum(1) / np.maximum(np.clip(B, 0, 1).sum(1), 1e-6)
        d = (S - off).astype(F32)
        pf = P.astype(F32)
        for op, f, k in parts + shoes + list(extras):
            e = f(pf)
            d = smin(d, e, k) if op == 'u' else smax(d, -e, k)
        if jacket is not None: d = np.minimum(d, jacket(S.astype(F32), I, pf))
        d = np.maximum(d, -pf[:, 2])                                                       # flat soles
        return d.reshape(p.shape[:-1])
    return fn, V

F32 = np.float32

def mesh_band(fn, step, bounds, coarse=12.0):
    """marching cubes over a narrow band: a coarse pass finds the surface, only cells near it are refined"""
    from scipy.ndimage import zoom
    (x0, y0, z0), (x1, y1, z1) = bounds
    axes = lambda st: [np.arange(a, b + st, st, dtype=F32) for a, b in ((x0, x1), (y0, y1), (z0, z1))]
    cx, cy, cz = axes(coarse)
    C = fn(np.stack(np.meshgrid(cx, cy, cz, indexing='ij'), -1))
    xs, ys, zs = axes(step)
    vol = zoom(C, (len(xs) / len(cx), len(ys) / len(cy), len(zs) / len(cz)), order=1)[:len(xs), :len(ys), :len(zs)]
    if vol.shape != (len(xs), len(ys), len(zs)):
        pad = [(0, n - m) for n, m in zip((len(xs), len(ys), len(zs)), vol.shape)]
        vol = np.pad(vol, pad, mode='edge')
    band = np.abs(vol) < coarse * 2.2
    ii = np.nonzero(band)
    P = np.stack([xs[ii[0]], ys[ii[1]], zs[ii[2]]], -1)
    out = np.empty(len(P), F32)
    for k in range(0, len(P), 2_000_000): out[k:k + 2_000_000] = fn(P[k:k + 2_000_000])
    vol[ii] = out
    vol[:, :, 0] = np.maximum(vol[:, :, 0], step)
    v, f, _, _ = marching_cubes(vol, 0.0, spacing=(step, step, step))
    v += np.array([x0, y0, z0], F32)
    return v.astype(np.float64), f.astype(np.int64)

# ── poses (MakeHuman frame: +Y up, +Z front, +X the figure's left) ─────────────────────
DOWN = {'upperarm01.L': (0.16, -1, -0.06), 'lowerarm01.L': (0.06, -1, 0.14),
        'upperarm01.R': (-0.16, -1, -0.06), 'lowerarm01.R': (-0.06, -1, 0.14),
        'upperleg01.L': (0.0, -1, 0.0), 'upperleg01.R': (-0.04, -1, -0.03),
        'lowerleg01.L': (0.02, -1, -0.04), 'lowerleg01.R': (0.0, -1, -0.02)}
POSES = {
    'down': DOWN,
    'present': {**DOWN, 'upperarm01.R': (-0.14, -1, 0.1), 'lowerarm01.R': (0.3, 0.0, 1)},
    'pockets': {**DOWN, 'upperarm01.L': (0.32, -1, -0.22), 'lowerarm01.L': (-0.45, -1, 0.55), 'upperarm01.R': (-0.32, -1, -0.22), 'lowerarm01.R': (0.45, -1, 0.55)},
    'hip': {**DOWN, 'upperarm01.R': (-0.75, -1, -0.15), 'lowerarm01.R': (0.85, -0.55, 0.25)},
    'phone': {**DOWN, 'upperarm01.L': (0.35, 0.05, 1), 'lowerarm01.L': (-0.25, 0.8, 0.6)},
    'cheer': {**DOWN, 'upperarm01.L': (0.35, 1, 0.15), 'lowerarm01.L': (0.1, 1, 0.1)},
    'crossed': {**DOWN, 'upperarm01.L': (0.3, -1, 0.35), 'lowerarm01.L': (-1, 0.12, 0.42), 'upperarm01.R': (-0.3, -1, 0.42), 'lowerarm01.R': (1, 0.2, 0.36)},
}

def build(name, gender, h, pose, outfit, step, tris_list, weight=0.5, muscle=0.5, extras_fn=None):
    H = Human(gender, weight, muscle)
    verts = H.pose(POSES[pose])
    extras = extras_fn(H, h) if extras_fn else ()
    fn, V = dressed(H, verts, outfit, h, extras)
    lo = V.min(0) - 60; hi = V.max(0) + 60; lo[2] = 0
    v, f = mesh_band(fn, step, (tuple(lo), tuple(hi)))
    v, f = keep_largest(v, f)
    import trimesh
    tm = trimesh.Trimesh(v, f, process=False)
    trimesh.smoothing.filter_taubin(tm, lamb=0.5, nu=-0.53, iterations=5)
    v = np.asarray(tm.vertices)
    for suffix, tris in tris_list:
        a, af = reduce(v, f, tris)
        write(name + suffix, a, af)

CROWD = [
    # name, gender, height, pose, outfit, weight
    ('crowd-a', 1.0, 1780, 'pockets', {'top': 'tee', 'sleeve': 'short'}, 0.5),
    ('crowd-b', 0.0, 1660, 'hip', {'top': 'tee', 'hair': 'long'}, 0.45),
    ('crowd-c', 1.0, 1820, 'crossed', {'top': 'hoodie'}, 0.65),
    ('crowd-d', 0.0, 1700, 'phone', {'top': 'tee', 'sleeve': 'short', 'hair': 'bun'}, 0.4),
    ('crowd-e', 1.0, 1750, 'down', {'top': 'blazer'}, 0.55),
    ('crowd-f', 0.0, 1640, 'down', {'top': 'shirt', 'hair': 'long'}, 0.5),
    ('crowd-g', 1.0, 1790, 'cheer', {'top': 'tee', 'sleeve': 'short'}, 0.5),
]

if __name__ == '__main__':
    only = sys.argv[1:]
    step = float(os.environ.get('STEP', 0))
    if not only or 'presenter' in only:
        build('presenter', 1.0, 1750, 'present', {'top': 'blazer', 'hair': 'short'}, step or 2.5, [('', 36000)])
    for name, g, h, pose, outfit, w in CROWD:
        if only and name not in only: continue
        build(name, g, h, pose, outfit, step or 8.0, [('', 700), ('-far', 180)], weight=w)
