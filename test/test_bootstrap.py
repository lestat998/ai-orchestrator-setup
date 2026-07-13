import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]


ENGRAM_STUB = r'''#!/usr/bin/env python3
import json
import os
import sys

if len(sys.argv) > 1 and sys.argv[1] in ("--version", "version"):
    print("engram test")
    raise SystemExit(0)
if sys.argv[1:] != ["capabilities", "--json"]:
    raise SystemExit(2)

contract = os.environ.get("STUB_CAPABILITY")
if contract == "missing":
    print(json.dumps({"features": {}}))
elif contract == "incomplete":
    print(json.dumps({
        "features": {
            "atomic_topic_cas": {
                "version": 1,
                "input_fields": ["topic_key", "expected_revision"],
                "success_fields": ["id", "sync_id"],
                "error_codes": ["revision_conflict"],
            }
        }
    }))
else:
    print(json.dumps({
        "features": {
            "atomic_topic_cas": {
                "version": 1,
                "input_fields": ["topic_key", "expected_revision"],
                "success_fields": ["id", "sync_id", "revision_count"],
                "error_codes": ["revision_conflict"],
            }
        }
    }))
'''


class BootstrapCapabilityTest(unittest.TestCase):
    def run_bootstrap(self, capability):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        base = Path(temp.name)
        home = base / "home"
        bin_dir = base / "bin"
        config = home / ".config" / "opencode"
        backup = home / ".config" / "opencode.backup.existing"
        bin_dir.mkdir(parents=True)
        config.mkdir(parents=True)
        backup.mkdir(parents=True)
        (config / "keep.txt").write_text("active-before\n")
        (backup / "keep.txt").write_text("backup-before\n")

        engram = bin_dir / "engram-stub"
        engram.write_text(textwrap.dedent(ENGRAM_STUB))
        engram.chmod(0o755)
        for name in ("codegraph", "opencode"):
            executable = bin_dir / name
            executable.write_text("#!/bin/sh\nexit 0\n")
            executable.chmod(0o755)
        date = bin_dir / "date"
        date.write_text("#!/bin/sh\nprintf '%s\\n' 20260713-120000\n")
        date.chmod(0o755)

        env = os.environ.copy()
        env.update({
            "HOME": str(home),
            "ENGRAM_BIN": str(engram),
            "PATH": f"{bin_dir}:{env['PATH']}",
            "STUB_CAPABILITY": capability,
        })
        result = subprocess.run(
            [str(ROOT / "bin" / "bootstrap")],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=20,
        )
        return result, config, backup, home, env

    def assert_preflight_failure_untouched(self, capability):
        result, config, backup, home, _ = self.run_bootstrap(capability)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("atomic_topic_cas", result.stderr)
        self.assertEqual((config / "keep.txt").read_text(), "active-before\n")
        self.assertEqual((backup / "keep.txt").read_text(), "backup-before\n")
        self.assertEqual(list((home / ".config").glob("opencode.backup.20*")), [])

    def test_capability_present_installs_staged_config_and_preserves_backup(self):
        result, config, backup, home, _ = self.run_bootstrap("present")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((config / "plugins" / "engram.ts").is_file())
        self.assertFalse((config / "keep.txt").exists())
        self.assertEqual((backup / "keep.txt").read_text(), "backup-before\n")
        generated_backups = list((home / ".config").glob("opencode.backup.20*"))
        self.assertEqual(len(generated_backups), 1)
        self.assertEqual((generated_backups[0] / "keep.txt").read_text(), "active-before\n")

    def test_fixed_date_collision_preserves_both_backups(self):
        result, config, _, home, env = self.run_bootstrap("present")
        self.assertEqual(result.returncode, 0, result.stderr)
        (config / "keep.txt").write_text("active-second-run\n")

        second_result = subprocess.run(
            [str(ROOT / "bin" / "bootstrap")],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=20,
        )

        self.assertEqual(second_result.returncode, 0, second_result.stderr)
        generated_backups = sorted((home / ".config").glob("opencode.backup.20260713-120000*"))
        self.assertEqual(len(generated_backups), 2)
        self.assertEqual((generated_backups[0] / "keep.txt").read_text(), "active-before\n")
        self.assertEqual((generated_backups[1] / "keep.txt").read_text(), "active-second-run\n")

    def test_capability_missing_fails_without_touching_config_or_backups(self):
        self.assert_preflight_failure_untouched("missing")

    def test_capability_incomplete_fails_without_touching_config_or_backups(self):
        self.assert_preflight_failure_untouched("incomplete")

    def test_archive_report_contract_requires_create_only_cas_and_winner_validation(self):
        archive_skill = (ROOT / "config" / "skills" / "sdd-archive" / "SKILL.md").read_text()
        persistence_contract = (
            ROOT / "config" / "skills" / "_shared" / "persistence-contract.md"
        ).read_text()
        status_contract = (
            ROOT / "config" / "skills" / "_shared" / "sdd-status-contract.md"
        ).read_text()

        for contract in (archive_skill, persistence_contract):
            self.assertIn("expected_revision: 0", contract)
            self.assertIn("revision_conflict", contract)
            self.assertIn("mem_get_observation", contract)
            self.assertIn("artifact/source observation-ID set", contract)
            self.assertIn("immutable-version topic/ID/sync_id/parent lineage", contract)
        self.assertIn("artifactSourceObservationIds", status_contract)
        self.assertIn("parentObservationId", status_contract)
        self.assertIn("parentSyncId", status_contract)
        self.assertIn("parentGeneration", status_contract)


if __name__ == "__main__":
    unittest.main()
