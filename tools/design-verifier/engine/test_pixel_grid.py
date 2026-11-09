import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from pixel_grid import audit


def layout(gap=8):
    def frame(node_id, parent, children, x, width):
        return {"id": node_id, "name": node_id, "type": "FRAME", "parent": parent,
                "children": children, "visible": True, "layoutMode": "NONE",
                "geometry": {"x": x, "y": 0, "width": width, "height": 40},
                "relativeTransform": [[1, 0, x], [0, 1, 0]]}
    root = frame("row", None, ["a", "b"], 101.5, 120)
    root.update(layoutMode="HORIZONTAL", paddingLeft=0, paddingRight=0,
                paddingTop=0, paddingBottom=0, itemSpacing=gap, layoutWrap="NO_WRAP")
    return {"coverage": "complete", "roots": ["row"], "nodes": [
        root, frame("a", "row", [], 0, 40), frame("b", "row", [], 40 + gap, 40)]}


class PixelGridTests(unittest.TestCase):
    def test_fractional_spacing_is_an_error_but_five_pixels_is_only_a_warning(self):
        result = audit(layout(5.5))
        self.assertEqual(result["status"], "FAIL")
        self.assertTrue(any(f["property"] == "itemSpacing" and f["code"] == "FRACTIONAL_PIXEL" for f in result["findings"]))
        result = audit(layout(5))
        self.assertEqual(result["status"], "WARN")
        self.assertEqual(result["errors"], 0)
        self.assertEqual(audit(layout(8))["status"], "PASS")

    def test_grid_can_be_two_four_or_eight(self):
        self.assertEqual(audit(layout(2), grid_step=2)["status"], "PASS")
        self.assertEqual(audit(layout(2), grid_step=4)["status"], "WARN")
        self.assertEqual(audit(layout(4), grid_step=8)["status"], "WARN")
        self.assertEqual(audit(layout(8), grid_step=8)["status"], "PASS")
        with self.assertRaises(ValueError):
            audit(layout(), grid_step=3)

    def test_serialization_noise_is_not_a_half_pixel_exception(self):
        self.assertEqual(audit(layout(7.999999))["status"], "PASS")
        self.assertEqual(audit(layout(7.5))["status"], "FAIL")

    def test_root_placement_is_ignored_but_container_size_and_padding_are_checked(self):
        snapshot = layout()
        self.assertEqual(audit(snapshot)["status"], "PASS")
        snapshot["nodes"][0]["geometry"]["width"] = 119.5
        snapshot["nodes"][0]["paddingLeft"] = 5.5
        properties = {f["property"] for f in audit(snapshot)["findings"]}
        self.assertTrue({"width", "paddingLeft"}.issubset(properties))
        self.assertNotIn("x", properties)

    def test_actual_gap_catches_space_between_even_if_item_spacing_is_integral(self):
        snapshot = layout(5.5)
        snapshot["nodes"][0]["itemSpacing"] = 8
        snapshot["nodes"][0]["primaryAxisAlignItems"] = "SPACE_BETWEEN"
        self.assertTrue(any(f["property"] == "gap[a,b]" and f["actual"] == 5.5 for f in audit(snapshot)["findings"]))
        snapshot["nodes"][2]["layoutPositioning"] = "ABSOLUTE"
        self.assertFalse(any(f["property"].startswith("gap[") for f in audit(snapshot)["findings"]))

    def test_hidden_subtree_is_excluded(self):
        snapshot = layout()
        snapshot["nodes"][2].update(visible=False, children=["missing-hidden-child"])
        snapshot["nodes"][2]["geometry"]["x"] = 47.5
        self.assertEqual(audit(snapshot)["status"], "PASS")
        snapshot["nodes"][0]["effectiveVisible"] = False
        self.assertEqual(audit(snapshot)["status"], "INCOMPLETE")

    def test_missing_spacing_or_partial_snapshot_cannot_pass(self):
        snapshot = layout()
        del snapshot["nodes"][0]["paddingLeft"]
        self.assertEqual(audit(snapshot)["status"], "INCOMPLETE")
        snapshot = layout()
        snapshot["coverage"] = "metadata-only"
        self.assertEqual(audit(snapshot)["status"], "INCOMPLETE")

    def test_exception_is_specific_and_reported_not_a_blanket_waiver(self):
        snapshot = layout()
        snapshot["nodes"][1]["geometry"].update(width=39.5, height=39.5)
        result = audit(snapshot, exceptions={"a": {"width": "Verified source artwork"}})
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(len(result["exceptions"]), 1)
        self.assertTrue(any(f["node"] == "a" and f["property"] == "height" for f in result["findings"]))

    def test_intrinsic_artwork_and_text_metrics_are_explicitly_scoped(self):
        snapshot = layout()
        snapshot["nodes"][1]["type"] = "VECTOR"
        snapshot["nodes"][1]["geometry"].update(y=.5, height=39.5)
        result = audit(snapshot)
        self.assertEqual(result["status"], "PASS")
        self.assertTrue(any(s["node"] == "a" for s in result["skipped"]))
        self.assertEqual(audit(snapshot, include_artwork=True)["status"], "FAIL")
        snapshot["nodes"][1]["type"] = "TEXT"
        self.assertEqual(audit(snapshot)["status"], "FAIL")
        snapshot["nodes"][1]["geometry"]["y"] = 0
        self.assertEqual(audit(snapshot)["status"], "PASS")

    def test_compare_cli_runs_grid_check_even_when_identical_sources_pass_fidelity(self):
        snapshot = layout(5.5)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.json"
            path.write_text(json.dumps(snapshot), encoding="utf-8")
            result = subprocess.run([sys.executable, "-B", str(Path(__file__).with_name("compare.py")),
                str(path), str(path), "--source-node", "row", "--target-node", "row", "--figma-rounding"],
                capture_output=True, text=True, encoding="utf-8")
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "PASS")
        self.assertEqual(report["pixelGrid"]["status"], "FAIL")
        self.assertEqual(report["overallStatus"], "FAIL")
        self.assertEqual(result.returncode, 1)


if __name__ == "__main__":
    unittest.main()
