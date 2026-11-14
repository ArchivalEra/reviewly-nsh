"""Measure the reviewly-nsh repo's own numbers for the facts ledger.

Lives in `zreflect/` so `import measure_reviewlynsh` works from facts.py.
Every number is computed here at run time; STATE.md only cites [[keys]].
"""

import os

import sys, os
sys.path.insert(0, os.path.dirname(__file__))
import gate  # noqa: E402
from ledger import fact  # noqa: E402


def _walk_code(root):
    n_tsx = n_ts = 0
    lines_tsx = lines_ts = 0
    for base, _dirs, files in os.walk(root):
        if "/.git" in base or "/node_modules" in base or "/.nsh" in base:
            continue
        for f in files:
            p = os.path.join(base, f)
            try:
                lines = sum(1 for _ in open(p, encoding="utf-8", errors="replace"))
            except OSError:
                continue  # uncountable files are not counted -- better absent than fake
            if f.endswith(".tsx"):
                n_tsx += 1
                lines_tsx += lines
            elif f.endswith(".ts") and not f.endswith(".d.ts"):
                n_ts += 1
                lines_ts += lines
    return n_tsx, lines_tsx, n_ts, lines_ts


def _count_dir(root, sub):
    d = os.path.join(root, sub)
    if not os.path.isdir(d):
        return 0
    return sum(1 for e in os.listdir(d) if e.endswith((".tsx", ".ts")))


def measure():
    root = gate.repo()
    n_tsx, lines_tsx, n_ts, lines_ts = _walk_code(root)
    facts = {}
    facts["tsx_files"] = fact(n_tsx, "python3 zreflect/facts.py --get tsx_files", "measure_reviewlynsh")
    facts["tsx_lines"] = fact(lines_tsx, "python3 zreflect/facts.py --get tsx_lines", "measure_reviewlynsh")
    facts["ts_files"] = fact(n_ts, "python3 zreflect/facts.py --get ts_files", "measure_reviewlynsh")
    facts["ts_lines"] = fact(lines_ts, "python3 zreflect/facts.py --get ts_lines", "measure_reviewlynsh")
    facts["pages"] = fact(_count_dir(root, "pages"), "python3 zreflect/facts.py --get pages", "measure_reviewlynsh")
    facts["components"] = fact(_count_dir(root, "components"), "python3 zreflect/facts.py --get components", "measure_reviewlynsh")
    return facts
