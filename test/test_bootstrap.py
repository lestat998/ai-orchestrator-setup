import json
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
        "schema_version": 1,
        "features": {
            "atomic_topic_cas": {
                "supported": True,
                "input": {
                    "expected_revision": {"type": "integer", "minimum": 0, "requires": "topic_key"},
                },
                "success_fields": ["id", "sync_id"],
                "error_codes": [
                    "revision_conflict",
                    "expected_revision_requires_topic",
                    "invalid_expected_revision",
                ],
            }
        }
    }))
else:
    print(json.dumps({
        "schema_version": 1,
        "features": {
            "atomic_topic_cas": {
                "supported": True,
                "input": {
                    "expected_revision": {"type": "integer", "minimum": 0, "requires": "topic_key"},
                },
                "success_fields": ["id", "sync_id", "revision_count"],
                "error_codes": [
                    "revision_conflict",
                    "expected_revision_requires_topic",
                    "invalid_expected_revision",
                ],
            }
        }
    }))
'''


class BootstrapCapabilityTest(unittest.TestCase):
    def run_bootstrap(self, capability, agents_md=None, dcp_json=None, dcp_version=None):
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
        if agents_md is not None:
            (config / "AGENTS.md").write_text(agents_md)
        if dcp_json is not None:
            (config / "dcp.jsonc").write_text(dcp_json)
        if dcp_version is not None:
            (config / ".dcp-config-version").write_text(dcp_version)

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
        self.assertEqual((config / ".dcp-config-version").read_text(), "2\n")

    def test_legacy_dcp_migration_preserves_user_thresholds_and_refreshes_explicit_tools(self):
        legacy_dcp = textwrap.dedent("""\
            {
              // User-owned tuning must survive migration.
              "enabled": false,
              "commands": { "enabled": false, "protectedTools": ["user-command"] },
              "turnProtection": { "enabled": true, "turns": 99 },
              "compress": {
                "maxContextLimit": 123456,
                "minContextLimit": 45678,
                "protectedTools": ["obsolete-tool"]
              },
              "strategies": {
                "deduplication": { "enabled": false, "protectedTools": ["obsolete-tool"] },
                "purgeErrors": { "turns": 12, "protectedTools": ["obsolete-tool"] }
              },
              "userExtension": { "keep": true },
            }
            """)
        result, config, _, _, _ = self.run_bootstrap("present", dcp_json=legacy_dcp)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((config / ".dcp-config-version").read_text(), "2\n")

        migrated = json.loads((config / "dcp.jsonc").read_text())
        defaults = json.loads(
            "\n".join(
                line for line in (ROOT / "config" / "dcp.jsonc").read_text().splitlines()
                if not line.lstrip().startswith("//")
            )
        )

        self.assertFalse(migrated["enabled"])
        self.assertFalse(migrated["commands"]["enabled"])
        self.assertEqual(migrated["commands"]["protectedTools"], ["user-command"])
        self.assertEqual(migrated["turnProtection"]["turns"], 99)
        self.assertEqual(migrated["compress"]["maxContextLimit"], 123456)
        self.assertEqual(migrated["compress"]["minContextLimit"], 45678)
        self.assertFalse(migrated["strategies"]["deduplication"]["enabled"])
        self.assertEqual(migrated["strategies"]["purgeErrors"]["turns"], 12)
        self.assertEqual(migrated["userExtension"], {"keep": True})

        self.assertEqual(
            migrated["compress"]["protectedTools"],
            defaults["compress"]["protectedTools"],
        )
        self.assertEqual(
            migrated["strategies"]["deduplication"]["protectedTools"],
            defaults["strategies"]["deduplication"]["protectedTools"],
        )
        self.assertEqual(
            migrated["strategies"]["purgeErrors"]["protectedTools"],
            defaults["strategies"]["purgeErrors"]["protectedTools"],
        )
        self.assertNotIn("mem_*", (config / "dcp.jsonc").read_text())
        self.assertEqual(len(list(config.glob("dcp.jsonc.bak-*"))), 1)

    def test_legacy_dcp_migration_adds_missing_managed_strategy_sections(self):
        legacy_dcp = textwrap.dedent("""\
            {
              "compress": { "maxContextLimit": 123456, "protectedTools": ["obsolete-tool"] },
              "strategies": { "deduplication": { "enabled": false } }
            }
            """)
        result, config, _, _, _ = self.run_bootstrap("present", dcp_json=legacy_dcp)
        self.assertEqual(result.returncode, 0, result.stderr)

        migrated = json.loads((config / "dcp.jsonc").read_text())
        defaults = json.loads(
            "\n".join(
                line for line in (ROOT / "config" / "dcp.jsonc").read_text().splitlines()
                if not line.lstrip().startswith("//")
            )
        )
        self.assertFalse(migrated["strategies"]["deduplication"]["enabled"])
        self.assertEqual(
            migrated["strategies"]["deduplication"]["protectedTools"],
            defaults["strategies"]["deduplication"]["protectedTools"],
        )
        self.assertEqual(
            migrated["strategies"]["purgeErrors"],
            defaults["strategies"]["purgeErrors"],
        )

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

    @staticmethod
    def _extract_block(text, open_marker, close_marker):
        start = text.index(open_marker)
        end = text.index(close_marker) + len(close_marker)
        return text[start:end]

    def test_agents_md_splice_preserves_user_regions_and_updates_managed(self):
        repo_agents = (ROOT / "config" / "AGENTS.md").read_text()
        engram_block = self._extract_block(
            repo_agents,
            "<!-- ai-orchestrator:engram-protocol -->",
            "<!-- /ai-orchestrator:engram-protocol -->",
        )
        codegraph_block = self._extract_block(
            repo_agents,
            "<!-- ai-orchestrator:codegraph-guidance -->",
            "<!-- /ai-orchestrator:codegraph-guidance -->",
        )

        live = textwrap.dedent("""\
            <!-- ai-orchestrator:persona -->
            ## Rules

            - MY CUSTOM PERSONA RULE: always answer like a pirate.
            <!-- /ai-orchestrator:persona -->

            # My personal freeform notes

            Freeform text outside any marker that must survive verbatim.

            <!-- ai-orchestrator:engram-protocol -->
            ## Engram (STALE)

            STALE ENGRAM CONTENT that must be replaced by the staged version.
            <!-- /ai-orchestrator:engram-protocol -->

            <!-- ai-orchestrator:codegraph-guidance -->
            ## CodeGraph (STALE)

            STALE CODEGRAPH CONTENT that must be replaced by the staged version.
            <!-- /ai-orchestrator:codegraph-guidance -->

            <!-- user-override: language -->
            ## Reply Language Override

            MY CUSTOM LANGUAGE OVERRIDE: reply in Klingon.
            """)

        result, config, _, home, env = self.run_bootstrap("present", agents_md=live)
        self.assertEqual(result.returncode, 0, result.stderr)

        spliced = (config / "AGENTS.md").read_text()

        # User-owned persona edits are preserved verbatim (and NOT overwritten
        # by the repo's own persona block, which is not a managed region).
        self.assertIn("MY CUSTOM PERSONA RULE: always answer like a pirate.", spliced)
        self.assertNotIn("Senior Architect", spliced)

        # User-owned override region preserved verbatim.
        self.assertIn("MY CUSTOM LANGUAGE OVERRIDE: reply in Klingon.", spliced)

        # Freeform text outside markers preserved verbatim.
        self.assertIn("# My personal freeform notes", spliced)
        self.assertIn("Freeform text outside any marker that must survive verbatim.", spliced)

        # Managed blocks now equal the repo's current version.
        self.assertIn(engram_block, spliced)
        self.assertIn(codegraph_block, spliced)

        # Stale managed content is gone.
        self.assertNotIn("STALE ENGRAM CONTENT", spliced)
        self.assertNotIn("STALE CODEGRAPH CONTENT", spliced)

        # Idempotency: a second run yields a byte-identical AGENTS.md.
        second_result = subprocess.run(
            [str(ROOT / "bin" / "bootstrap")],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=20,
        )
        self.assertEqual(second_result.returncode, 0, second_result.stderr)
        self.assertEqual((config / "AGENTS.md").read_text(), spliced)


if __name__ == "__main__":
    unittest.main()
