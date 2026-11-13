#!/usr/bin/env python3
"""Build the static site and offline download. Python standard library only.

The editable HTML/CSS/JS in this repository is the source. This script
regenerates the offline ZIP, checks links, and copies only the public files
into dist/ (scripts, docs and repository files are not published).
"""
from pathlib import Path
import shutil
import subprocess
import sys

from site_pages import PAGES, OFFLINE_ZIP

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    for script in ("build_offline.py", "check_site.py"):
        subprocess.run([sys.executable, str(ROOT / "scripts" / script)], cwd=ROOT, check=True)
    output = ROOT / "dist"
    if output.is_symlink():
        raise ValueError("Build output must not be a symbolic link")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()
    for name in PAGES:
        shutil.copy2(ROOT / name, output / name)
    shutil.copytree(ROOT / "assets", output / "assets")
    (output / "downloads").mkdir()
    shutil.copy2(ROOT / OFFLINE_ZIP, output / OFFLINE_ZIP)
    print(f"Static site ready: dist/ ({len(PAGES)} pages)")


if __name__ == "__main__":
    main()
