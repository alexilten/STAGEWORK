# -*- coding: utf-8 -*-
"""
STAGECRAFT -> native Rhino dimensions

Run it in Rhino 7 or 8 with a STAGECRAFT .3dm open: Tools > PythonScript > Run (RunPythonScript),
or open it in Rhino 8's ScriptEditor and press Run.

A STAGECRAFT .3dm draws every dimension as a line, two ticks and a text dot on
90_TECHNICAL::90_01_DIMENSIONS, because McNeel's rhino3dm (what writes the file in the browser)
cannot create dimension objects. This script turns each one into a native aligned dimension in a
"STAGECRAFT" dimension style on the same layer, so the dimensions follow your units, scale and
annotation settings. The original lines, ticks and dots move to a hidden sub-layer
90_TECHNICAL::90_01_DIMENSIONS::SC_SOURCE, so nothing is lost. Running it twice is safe.

Plan dimensions (at floor level) lie flat; dimensions above the floor stand up facing the house
(the -Y direction), the way the stage and LED elevations are read.
"""
import System
import Rhino
import scriptcontext as sc
from Rhino.Geometry import Plane, Point3d, Vector3d

DIM_LAYER = "90_TECHNICAL::90_01_DIMENSIONS"
SOURCE = "SC_SOURCE"
STYLE = "STAGECRAFT"


def dim_style():
    ds = sc.doc.DimStyles.FindName(STYLE)
    if ds is not None:
        return ds
    d = Rhino.DocObjects.DimensionStyle()
    d.Name = STYLE
    d.TextHeight = 150.0          # mm, read at 1:50 to 1:100
    d.ArrowLength = 120.0
    d.ExtensionLineExtension = 60.0
    d.ExtensionLineOffset = 0.0
    d.TextGap = 40.0
    d.LengthResolution = 0
    sc.doc.DimStyles.Add(d, False)
    return sc.doc.DimStyles.FindName(STYLE)


def source_layer(parent_index):
    parent = sc.doc.Layers[parent_index]
    full = parent.FullPath + "::" + SOURCE
    i = sc.doc.Layers.FindByFullPath(full, -1)
    if i >= 0:
        return i
    layer = Rhino.DocObjects.Layer()
    layer.Name = SOURCE
    layer.ParentLayerId = parent.Id
    layer.IsVisible = False
    return sc.doc.Layers.Add(layer)


def main():
    li = sc.doc.Layers.FindByFullPath(DIM_LAYER, -1)
    if li < 0:
        print("No STAGECRAFT dimension layer (%s) in this file." % DIM_LAYER)
        return
    style = dim_style()
    hidden = source_layer(li)
    objs = sc.doc.Objects.FindByLayer(sc.doc.Layers[li]) or []
    by_name = {}
    for o in objs:
        by_name.setdefault(o.Attributes.Name or "", []).append(o)
    made = 0
    for o in objs:
        name = o.Attributes.Name or ""
        if not name.startswith("DIM.") or name.endswith(".LABEL") or name.endswith(".TICK"):
            continue
        crv = o.Geometry
        if not isinstance(crv, Rhino.Geometry.Curve):
            continue
        a, b = crv.PointAtStart, crv.PointAtEnd
        d = b - a
        if d.Length < 1:
            continue
        d.Unitize()
        if abs(d.Z) > 0.9:
            # vertical: stand in the elevation plane facing the house
            plane = Plane(a, d, Vector3d(1, 0, 0) if abs(d.X) < 0.9 else Vector3d(0, 1, 0))
        elif abs(a.Z) < 1 and abs(b.Z) < 1:
            # on the floor: flat, in plan
            plane = Plane(a, d, Vector3d.CrossProduct(Vector3d.ZAxis, d))
        else:
            # horizontal, above the floor: upright, read from the house
            plane = Plane(a, d, Vector3d.ZAxis)
        mid = Point3d((a.X + b.X) / 2, (a.Y + b.Y) / 2, (a.Z + b.Z) / 2)
        dim = Rhino.Geometry.LinearDimension.Create(
            Rhino.Geometry.AnnotationType.Aligned, style, plane, plane.XAxis, a, b, mid, 0.0)
        if dim is None:
            continue
        attrs = o.Attributes.Duplicate()
        attrs.Name = name + ".DIM"
        if sc.doc.Objects.AddLinearDimension(dim, attrs) == System.Guid.Empty:
            continue
        made += 1
        # park the source line, its ticks and label on the hidden sub-layer
        for part in [o] + by_name.get(name + ".TICK", []) + by_name.get(name + ".LABEL", []):
            at = part.Attributes.Duplicate()
            at.LayerIndex = hidden
            sc.doc.Objects.ModifyAttributes(part, at, True)
    sc.doc.Views.Redraw()
    print("STAGECRAFT: %d native dimensions added (style '%s'); sources hidden on %s::%s." % (made, STYLE, DIM_LAYER, SOURCE))


main()
