"""Copy the supplied verifier into this project and verify every copied byte."""

import hashlib
import json
from pathlib import Path
import shutil


root = Path(__file__).resolve().parents[1]
source = root.parent / "Верификатор"
target = root / "tools" / "design-verifier"
report_path = root / "integration" / "verifier-copy.json"

if target.exists():
    raise SystemExit("Target already exists; refusing to overwrite a verifier history.")
if not (source / "cli.mjs").is_file():
    raise SystemExit("Source verifier was not found.")

shutil.copytree(source, target)
print("Copied verifier; verifying SHA-256...", flush=True)


def digest(file):
    result = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


files = []
for original in sorted(source.rglob("*")):
    if not original.is_file():
        continue
    relative = original.relative_to(source)
    copied = target / relative
    expected = digest(original)
    actual = digest(copied)
    if expected != actual:
        raise SystemExit(f"Copy differs: {relative}")
    files.append({"path": relative.as_posix(), "bytes": copied.stat().st_size, "sha256": actual})

report = {
    "schema": "chess-verifier-integration/1",
    "source": str(source),
    "target": "tools/design-verifier",
    "scope": "Initial complete copy, including Poker history and Chess concept revisions; not design approval.",
    "status": "PASS",
    "files": files,
    "fileCount": len(files),
    "bytes": sum(file["bytes"] for file in files),
}
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({key: value for key, value in report.items() if key != "files"}, ensure_ascii=False), flush=True)
