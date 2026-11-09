"""Read-only layout lint: whole pixels required, a 2/4/8 px grid preferred."""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

LAYOUT_TYPES = {"FRAME", "INSTANCE", "COMPONENT", "COMPONENT_SET"}
SPACING = ("paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "itemSpacing")
EPSILON = 0.001  # Figma float serialization noise, not a half-pixel allowance.


def audit(snapshot, root_ids=None, grid_step=2, exceptions=None, include_artwork=False):
    if grid_step not in (2, 4, 8):
        raise ValueError("Grid step must be 2, 4 or 8 px")
    exceptions = exceptions or {}
    index = {n["id"]: n for n in snapshot["nodes"]}
    roots = root_ids if root_ids is not None else snapshot.get("roots")
    if roots is None:
        roots = [n["id"] for n in snapshot["nodes"] if n.get("parent") is None]
    findings, waived, missing, skipped = [], [], [], []
    seen = set()
    checked_values = 0

    def check(node, prop, value):
        nonlocal checked_values
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            missing.append({"node": node["id"], "property": prop, "reason": "Missing or invalid numeric value"})
            return
        checked_values += 1
        if abs(value - round(value)) > EPSILON:
            code, severity = "FRACTIONAL_PIXEL", "error"
        elif abs(value - round(value / grid_step) * grid_step) > EPSILON:
            code, severity = "OFF_GRID", "warning"
        else:
            return
        item = {"node": node["id"], "name": node.get("name", ""), "property": prop,
                "actual": value, "code": code, "severity": severity,
                "nearestWholePx": round(value), "nearestGridPx": round(value / grid_step) * grid_step}
        reason = exceptions.get(node["id"], {}).get(prop)
        if isinstance(reason, str) and reason.strip():
            waived.append({**item, "reason": reason})
        else:
            findings.append(item)

    def visit(node_id, root=False):
        if node_id in seen:
            return
        seen.add(node_id)
        node = index.get(node_id)
        if node is None:
            missing.append({"node": node_id, "reason": "Missing node"})
            return
        if node.get("visible") is False or node.get("effectiveVisible") is False:
            skipped.append({"node": node_id, "reason": "Hidden subtree"})
            return
        kind = node.get("type")
        geometry = node.get("geometry", {})
        if kind in LAYOUT_TYPES or include_artwork:
            properties = ("width", "height") if root else ("x", "y", "width", "height")
        elif kind == "TEXT":
            properties = () if root else ("x", "y")
        else:
            properties = ()
            skipped.append({"node": node_id, "reason": "Artwork geometry; enable --include-artwork to inspect"})
        for prop in properties:
            check(node, prop, geometry.get(prop))

        children = node.get("children", [])
        if node.get("layoutMode") in ("HORIZONTAL", "VERTICAL"):
            for prop in SPACING:
                check(node, prop, node.get(prop))
            if node.get("layoutWrap") == "WRAP":
                check(node, "counterAxisSpacing", node.get("counterAxisSpacing"))
                skipped.append({"node": node_id, "reason": "Derived gaps across wrapped rows are not inferred"})
            else:
                # Measured gaps catch fractional SPACE_BETWEEN results even when
                # configured itemSpacing is integral. Absolute children do not participate.
                axis, size = ("x", "width") if node["layoutMode"] == "HORIZONTAL" else ("y", "height")
                flowing = [index[c] for c in children if c in index and
                           index[c].get("visible") is not False and
                           index[c].get("effectiveVisible") is not False and
                           index[c].get("layoutPositioning") != "ABSOLUTE"]
                for before, after in zip(flowing, flowing[1:]):
                    values = (after.get("geometry", {}).get(axis), before.get("geometry", {}).get(axis),
                              before.get("geometry", {}).get(size))
                    prop = "gap[" + before["id"] + "," + after["id"] + "]"
                    valid = all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in values)
                    check(node, prop, values[0] - values[1] - values[2] if valid else None)
        for child in children:
            visit(child)

    if not roots:
        missing.append({"reason": "No roots to inspect"})
    if snapshot.get("coverage") != "complete" or snapshot.get("unavailable"):
        missing.append({"reason": "Snapshot is incomplete; recapture with figma-capture.js"})
    for root_id in roots:
        visit(root_id, root=True)
    if not checked_values:
        missing.append({"reason": "No layout values checked in the selected scope"})
    errors = sum(f["severity"] == "error" for f in findings)
    warnings = sum(f["severity"] == "warning" for f in findings)
    status = "FAIL" if errors else "INCOMPLETE" if missing else "WARN" if warnings else "PASS"
    return {"status": status, "gridStepPx": grid_step, "numericEpsilonPx": EPSILON,
            "scope": "all geometry" if include_artwork else "container geometry, text positions, Auto Layout spacing",
            "rootPlacementChecked": False, "checkedNodes": len(seen), "checkedValues": checked_values,
            "errors": errors, "warnings": warnings, "coverageComplete": not missing,
            "findings": findings, "exceptions": waived, "missing": missing, "skipped": skipped}


def combine_status(fidelity, grid):
    """Fidelity tolerances and expected source changes never waive pixel lint."""
    if "FAIL" in (fidelity, grid):
        return "FAIL"
    if "INCOMPLETE" in (fidelity, grid):
        return "INCOMPLETE"
    return "WARN" if grid == "WARN" else fidelity


def main():
    from compare import read_snapshot
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot")
    parser.add_argument("--root", action="append", help="Figma root ID; repeat for multiple roots")
    parser.add_argument("--grid-step", type=int, choices=(2, 4, 8), default=2)
    parser.add_argument("--exceptions", help="JSON: exact node ID -> property -> explicit reason")
    parser.add_argument("--include-artwork", action="store_true")
    parser.add_argument("--output")
    args = parser.parse_args()
    exceptions = json.loads(Path(args.exceptions).read_text(encoding="utf-8")) if args.exceptions else None
    result = audit(read_snapshot(args.snapshot), args.root, args.grid_step, exceptions, args.include_artwork)
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    raise SystemExit(1 if result["status"] == "FAIL" else 2 if result["status"] == "INCOMPLETE" else 0)


if __name__ == "__main__":
    main()
