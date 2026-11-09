import copy
import unittest
from compare import compare


def fixture(prefix="s", scale=1, root_x=0):
    def node(suffix, name, kind, x, y, width, height, parent, children):
        return {"id": prefix + suffix, "name": name, "type": kind,
                "geometry": {"x": x, "y": y, "width": width, "height": height},
                "relativeTransform": [[1, 0, x], [0, 1, y]],
                "parent": parent, "children": children, "paints": [],
                "visible": True, "opacity": 1, "rotation": 0}
    return {"coverage": "complete", "nodes": [
        node("0", "Avatar way", "INSTANCE", root_x, 0, 100*scale, 100*scale, None, [prefix+"1"]),
        node("1", "photo", "RECTANGLE", 10*scale, -5*scale, 80*scale, 100*scale, prefix+"0", [])]}


class FidelityTests(unittest.TestCase):
    def test_uniform_scale_and_new_screen_position_are_valid(self):
        self.assertEqual(compare(fixture(), fixture("t", .835, 800), "s0", "t0")["status"], "PASS")

    def test_one_pixel_inner_shift_is_caught_with_root_unchanged(self):
        target = fixture("t", .835)
        target["nodes"][1]["geometry"]["x"] += 1
        target["nodes"][1]["relativeTransform"][0][2] += 1
        result = compare(fixture(), target, "s0", "t0")
        self.assertEqual(result["status"], "FAIL")
        self.assertTrue(any(f["code"] == "CENTER_DRIFT" for f in result["findings"]))

    def test_equal_mobile_copies_can_both_fail_the_canonical_source(self):
        broken = fixture("t")
        broken["nodes"][1]["geometry"]["x"] += 5
        broken["nodes"][1]["relativeTransform"][0][2] += 5
        self.assertEqual(compare(broken, copy.deepcopy(broken), "t0", "t0")["status"], "PASS")
        self.assertEqual(compare(fixture(), broken, "s0", "t0")["status"], "FAIL")

    def test_metadata_cannot_pass_visual_fidelity(self):
        partial = fixture("t")
        partial["coverage"] = "metadata-only"
        self.assertEqual(compare(fixture(), partial, "s0", "t0")["status"], "INCOMPLETE")

    def test_allowed_visibility_does_not_hide_a_shift(self):
        target = fixture("t")
        target["nodes"][1]["visible"] = False
        target["nodes"][1]["geometry"]["x"] += 2
        result = compare(fixture(), target, "s0", "t0", {"t1": {"visible": "requested hidden state"}})
        self.assertEqual(len(result["expectedChanges"]), 1)
        self.assertEqual(result["status"], "FAIL")

    def test_stretched_root_and_missing_descendant_do_not_pass(self):
        target = fixture("t")
        target["nodes"][0]["geometry"]["height"] = 94
        self.assertEqual(compare(fixture(), target, "s0", "t0")["status"], "FAIL")
        target = fixture("t")
        target["nodes"][0]["children"] = []
        self.assertEqual(compare(fixture(), target, "s0", "t0")["status"], "INCOMPLETE")

    def test_constraint_rounding_never_masks_size_or_one_pixel_drift(self):
        source, target = fixture(), fixture("t", .835)
        for snap in (source, target):
            snap["nodes"][1]["constraints"] = {"horizontal": "CENTER", "vertical": "MAX"}
        target["nodes"][1]["geometry"]["x"] += .5
        target["nodes"][1]["relativeTransform"][0][2] += .5
        self.assertEqual(compare(source, target, "s0", "t0", figma_rounding=True)["status"], "PASS_WITH_ROUNDING")
        target["nodes"][1]["geometry"]["x"] += .5
        self.assertEqual(compare(source, target, "s0", "t0", figma_rounding=True)["status"], "FAIL")
        target = fixture("t", .835)
        target["nodes"][1]["geometry"]["width"] += .5
        self.assertEqual(compare(source, target, "s0", "t0", figma_rounding=True)["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
