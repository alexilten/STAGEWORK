#!/usr/bin/env python3
"""Independent check of STAGECRAFT .3dm exports using McNeel's Python rhino3dm (a separate
openNURBS build from the JS exporter). Usage: python3 scripts/verify_3dm.py samples/*.3dm"""
import json, sys
import rhino3dm as r

REQUIRED = ["00_REFERENCE", "10_STAGE::10_01_DECKING", "10_STAGE::10_03_SUPPORTS", "20_LED::20_01_CABINETS",
            "30_RIGGING::30_01_TRUSS", "40_LIGHTING::40_01_FIXTURES", "90_TECHNICAL::90_01_DIMENSIONS"]

def check(path):
    m = r.File3dm.Read(path)
    assert m is not None, "unreadable"
    errors = []
    if m.Settings.ModelUnitSystem != r.UnitSystem.Millimeters: errors.append("units are not mm")
    layers = [l.FullPath for l in m.Layers]
    errors += [f"missing layer {l}" for l in REQUIRED if l not in layers]
    idefs = {d.Id: d for d in m.InstanceDefinitions}
    names, refs, solids = set(), 0, 0
    dup = 0
    for o in m.Objects:
        a = o.Attributes
        if a.IsInstanceDefinitionObject:
            continue
        g = o.Geometry
        if isinstance(g, r.InstanceReference):
            refs += 1
            if g.ParentIdefId not in idefs: errors.append(f"{a.Name}: dangling block reference")
        elif isinstance(g, r.Extrusion):
            solids += 1
            if not g.IsSolid: errors.append(f"{a.Name}: extrusion not closed")
        if a.Name and not a.Name.endswith((".TICK", ".LABEL")):
            if a.Name in names: dup += 1
            names.add(a.Name)
    if dup: errors.append(f"{dup} duplicate object names")
    for d in idefs.values():
        for gid in d.GetObjectIds():
            ob = m.Objects.FindId(gid)
            if isinstance(ob.Geometry, r.Extrusion) and not ob.Geometry.IsSolid: errors.append(f"block {d.Name}: open extrusion")
    project = None
    for i in range(len(m.Strings)):
        k, v = m.Strings[i]
        if k == "stagecraft.project": project = json.loads(v)
    if not project: errors.append("embedded project missing")
    status = "PASS" if not errors else "FAIL"
    print(f"{status} {path}: v{r.File3dm.ReadArchiveVersion(path)} · {len(layers)} layers · {len(idefs)} blocks · "
          f"{refs} block instances · {solids} loose solids · project '{project and project['name']}'")
    for e in errors[:10]: print("   ", e)
    return not errors

ok = all([check(p) for p in sys.argv[1:]])
sys.exit(0 if ok else 1)
