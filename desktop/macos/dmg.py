"""Finder metadata is written without launching/automating Finder (also on CI)."""
import json
import os
import subprocess
import sys

import dmgbuild

with open(sys.argv[1], encoding="utf-8") as source:
    settings = json.load(source)

def verify_payload(path, options):
    # Validate the final payload too: dmgbuild performs another copy into HFS+.
    subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict",
                    os.path.join(path, "Lapka.app")], check=True)
settings["create_hook"] = verify_payload
dmgbuild.build_dmg(sys.argv[2], sys.argv[3], settings=settings)
