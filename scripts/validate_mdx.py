#!/usr/bin/env python3
"""Compatibility shim that delegates to the canonical validation script kept under
`.github/skills/blog-post-creator/scripts/validate_mdx.py`.
Do not modify the logic here — update the canonical script instead.
"""
import os
import sys
import subprocess

SCRIPT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '.github', 'skills', 'blog-post-creator', 'scripts', 'validate_mdx.py'))
if not os.path.exists(SCRIPT):
    print("Canonical validation script not found:", SCRIPT)
    sys.exit(2)

rc = subprocess.call([sys.executable, SCRIPT])
sys.exit(rc)
