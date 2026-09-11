#!/usr/bin/env python3
"""Run .agents regression tests in isolated pytest subprocesses.

Isolation prevents third-party/global pytest plugins or leaked runtime state from
making the aggregate suite hang after all assertions have completed.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEST_DIR = ROOT / "tests"
DEFAULT_TIMEOUT = 90


def main() -> int:
    files = sorted(TEST_DIR.glob("test_*.py"))
    if not files:
        print("FAIL: no regression test files found", file=sys.stderr)
        return 2

    env = os.environ.copy()
    env["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] = "1"
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    passed = 0
    failed: list[str] = []

    for test_file in files:
        rel = test_file.relative_to(ROOT)
        print(f"=== {rel} ===", flush=True)
        try:
            p = subprocess.run(
                [sys.executable, "-m", "pytest", "-q", str(test_file)],
                cwd=str(ROOT), env=env, text=True, encoding="utf-8", errors="replace",
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                timeout=DEFAULT_TIMEOUT,
            )
        except subprocess.TimeoutExpired as exc:
            out = exc.stdout or ""
            if isinstance(out, bytes):
                out = out.decode("utf-8", "replace")
            if out:
                print(out, end="" if out.endswith("\n") else "\n")
            print(f"FAIL: {rel} timed out after {DEFAULT_TIMEOUT}s")
            failed.append(str(rel))
            continue

        print(p.stdout, end="" if p.stdout.endswith("\n") else "\n")
        if p.returncode == 0:
            passed += 1
        else:
            failed.append(str(rel))

    print(f"REGRESSION_FILES_PASS={passed}/{len(files)}")
    if failed:
        print("FAILED_FILES=" + ",".join(failed))
        return 1
    print("REGRESSION_STATUS=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
