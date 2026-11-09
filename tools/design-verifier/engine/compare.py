"""Compare Figma artwork with its exact source; never equate missing evidence to PASS.

Usage: python compare.py source.json target.json --source-node ID --target-node ID
Snapshots are produced by figma-capture.js. XML from get_metadata is accepted for
outer geometry only and deliberately produces INCOMPLETE for artwork fidelity.
"""
from __future__ import annotations

import argparse
import json
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path


def visual_value(value):
    """Variable IDs are file-local; compare resolved paints rather than aliases."""
    if isinstance(value, dict):
        return {k: visual_value(v) for k, v in value.items() if k != "boundVariables"}
    if isinstance(value, list):
        return [visual_value(v) for v in value]
    if isinstance(value, float):
        return round(value, 5)
    return value


def read_snapshot(path):
    text = Path(path).read_text(encoding="utf-8")
    if text.lstrip().startswith("<"):
        root = ET.fromstring(text.split("IMPORTANT:")[0])
        nodes = []

        def walk(element, parent=None):
            a = element.attrib
            node = {"id": a["id"], "name": a.get("name", ""),
                    "type": element.tag.upper(), "parent": parent,
                    "children": [c.attrib["id"] for c in element],
                    "geometry": {k: float(a.get(k, 0)) for k in ("x", "y", "width", "height")},
                    "geometryOnly": True}
            nodes.append(node)
            for child in element:
                walk(child, node["id"])

        walk(root)
        return {"coverage": "metadata-only", "roots": [root.attrib["id"]], "nodes": nodes}
    return json.loads(text)


def subtree(snapshot, root_id):
    index = {n["id"]: n for n in snapshot["nodes"]}
    result = {}

    def walk(node_id, path):
        node = index[node_id]
        result[path] = node
        occurrences = Counter()
        for child_id in node.get("children", []):
            child = index[child_id]
            key = (child["type"], child["name"])
            occurrence = occurrences[key]
            occurrences[key] += 1
            walk(child_id, path + ((key[0], key[1], occurrence),))

    walk(root_id, ())
    return result


def compare(source, target, source_id, target_id, allowed=None, tolerance=0.25, figma_rounding=False):
    """Uniform-scale artwork comparison, in target pixels.

    Position of the artwork root on the screen is intentionally irrelevant.
    Every descendant stays relative to its own parent. Allowed changes are
    exact target-node/property pairs with a human-authored reason.
    """
    allowed = allowed or {}
    findings = []
    expected_changes = []
    rounding = []

    def finding(code, s=None, t=None, **details):
        item = {"code": code, "source": s, "target": t, **details}
        reason = allowed.get(t or "", {}).get(details.get("property", ""))
        if reason and code in ("GEOMETRY_DRIFT", "PROPERTY_DRIFT"):
            expected_changes.append({**item, "reason": reason})
        else:
            findings.append(item)

    try:
        old = subtree(source, source_id)
        new = subtree(target, target_id)
    except KeyError as exc:
        return {"status": "INCOMPLETE", "findings": [{"code": "MISSING_NODE", "id": str(exc)}],
                "matchedNodes": 0, "expectedChanges": []}

    a, b = old[()]["geometry"], new[()]["geometry"]
    if a["width"] <= 0 or a["height"] <= 0:
        return {"status": "INCOMPLETE", "findings": [{"code": "DEGENERATE_REFERENCE"}],
                "matchedNodes": 0, "expectedChanges": []}
    scale = b["width"] / a["width"]
    if abs(b["height"] - a["height"] * scale) > tolerance:
        finding("ASPECT_RATIO_DRIFT", source_id, target_id, expectedHeight=a["height"] * scale,
                actualHeight=b["height"], scale=scale)

    metadata_only = source.get("coverage") != "complete" or target.get("coverage") != "complete"
    if metadata_only:
        finding("MISSING_ARTWORK_EVIDENCE", source_id, target_id,
                detail="Metadata does not expose complete instance internals, paints, masks or transforms.")

    matched = 0
    for path, sn in old.items():
        tn = new.get(path)
        if tn is None:
            finding("UNMATCHED_SOURCE_NODE", sn["id"], target_id, path=path)
            continue
        matched += 1
        def positional_limit(axis):
            key = "horizontal" if axis == "x" else "vertical"
            constraint = sn.get("constraints", {}).get(key)
            same = constraint == tn.get("constraints", {}).get(key)
            if figma_rounding and same and constraint in ("CENTER", "MAX"):
                # Both source and destination can snap an anchor by half a pixel.
                return max(tolerance, 0.5 * (1 + scale) + 0.0001)
            return tolerance
        # Zero-depth position is the placement of the whole artwork, not fidelity.
        if path:
            for prop in ("x", "y", "width", "height"):
                expected = sn["geometry"][prop] * scale
                actual = tn["geometry"][prop]
                limit = positional_limit(prop) if prop in ("x", "y") else tolerance
                if tolerance < abs(actual - expected) <= limit:
                    rounding.append({"source": sn["id"], "target": tn["id"],
                                     "property": prop, "delta": actual - expected, "limit": limit})
                if abs(actual - expected) > limit:
                    finding("GEOMETRY_DRIFT", sn["id"], tn["id"], property=prop,
                            expected=expected, actual=actual, delta=actual - expected)
            # Explain the perceptually relevant error in target pixels as well.
            for axis, dimension in (("x", "width"), ("y", "height")):
                expected = (sn["geometry"][axis] + sn["geometry"][dimension] / 2) * scale
                actual = tn["geometry"][axis] + tn["geometry"][dimension] / 2
                if abs(actual - expected) > positional_limit(axis):
                    finding("CENTER_DRIFT", sn["id"], tn["id"], axis=axis,
                            expected=expected, actual=actual, delta=actual - expected)
        if not metadata_only:
            for prop in ("visible", "opacity", "rotation", "clipsContent", "isMask", "maskType",
                         "componentKey", "characters", "paints"):
                if visual_value(sn.get(prop)) != visual_value(tn.get(prop)):
                    finding("PROPERTY_DRIFT", sn["id"], tn["id"], property=prop,
                            expected=sn.get(prop), actual=tn.get(prop))
            # Matrix linear terms must preserve rotation/skew; translation scales.
            for row in range(2):
                for col in range(3):
                    sm, tm = sn.get("relativeTransform"), tn.get("relativeTransform")
                    if sm is None or tm is None:
                        finding("MISSING_TRANSFORM", sn["id"], tn["id"])
                        break
                    if not path and col == 2:
                        continue
                    expected = sm[row][col] * (scale if col == 2 else 1)
                    threshold = positional_limit("x" if row == 0 else "y") if col == 2 else 0.001
                    if abs(tm[row][col] - expected) > threshold:
                        finding("TRANSFORM_DRIFT", sn["id"], tn["id"], row=row, column=col,
                                expected=expected, actual=tm[row][col])
    for path, tn in new.items():
        if path not in old:
            finding("UNMATCHED_TARGET_NODE", source_id, tn["id"], path=path)
    missing = any(f["code"].startswith(("MISSING", "UNMATCHED")) for f in findings)
    errors = any(not f["code"].startswith(("MISSING", "UNMATCHED")) for f in findings)
    return {"status": "FAIL" if errors else "INCOMPLETE" if missing else "PASS_WITH_ROUNDING" if rounding else "PASS",
            "coverageComplete": not missing, "scale": scale, "tolerancePx": tolerance,
            "sourceRoot": source_id, "targetRoot": target_id, "matchedNodes": matched,
            "findings": findings, "expectedChanges": expected_changes, "rounding": rounding}


def main():
    from pixel_grid import audit, combine_status
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--source-node", required=True)
    parser.add_argument("--target-node", required=True)
    parser.add_argument("--allowed", help="JSON of exact target node → property → reason")
    parser.add_argument("--output")
    parser.add_argument("--figma-rounding", action="store_true", help="Account for separately verified CENTER/MAX anchor snapping")
    parser.add_argument("--grid-step", type=int, choices=(2, 4, 8), default=2)
    parser.add_argument("--grid-exceptions", help="Separate JSON: exact node -> property -> reason for pixel-grid exception")
    parser.add_argument("--include-artwork", action="store_true", help="Also lint intrinsic artwork geometry")
    args = parser.parse_args()
    target = read_snapshot(args.target)
    result = compare(read_snapshot(args.source), target, args.source_node,
                     args.target_node, json.loads(Path(args.allowed).read_text(encoding="utf-8")) if args.allowed else None,
                     figma_rounding=args.figma_rounding)
    grid_exceptions = json.loads(Path(args.grid_exceptions).read_text(encoding="utf-8")) if args.grid_exceptions else None
    result["pixelGrid"] = audit(target, [args.target_node], args.grid_step, grid_exceptions, args.include_artwork)
    result["overallStatus"] = combine_status(result["status"], result["pixelGrid"]["status"])
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    raise SystemExit(1 if result["overallStatus"] == "FAIL" else 2 if result["overallStatus"] == "INCOMPLETE" else 0)


if __name__ == "__main__":
    main()
