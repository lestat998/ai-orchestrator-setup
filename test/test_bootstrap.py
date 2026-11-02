import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]

ENGRAM_STUB = r'''#!/usr/bin/env python3
import json
import os
import sys

if sys.argv[1:] in (["--version"], ["version"]):
    print(os.environ.get("STUB_ENGRAM_VERSION", "engram test"))
    raise SystemExit(0)
if sys.argv[1:] != ["capabilities", "--json"]:
    raise SystemExit(2)

contract = os.environ.get("STUB_CAPABILITY")
if contract == "missing":
    print(json.dumps({"features": {}}))
elif contract == "incomplete":
    print(json.dumps({
        "schema_version": 1,
        "features": {"atomic_topic_cas": {
            "supported": True,
            "input": {"expected_revision": {"type": "integer", "minimum": 0, "requires": "topic_key"}},
            "success_fields": ["id", "sync_id"],
            "error_codes": ["revision_conflict", "expected_revision_requires_topic", "invalid_expected_revision"],
        }},
    }))
else:
    print(json.dumps({
        "schema_version": 1,
        "features": {"atomic_topic_cas": {
            "supported": True,
            "input": {"expected_revision": {"type": "integer", "minimum": 0, "requires": "topic_key"}},
            "success_fields": ["id", "sync_id", "revision_count"],
            "error_codes": ["revision_conflict", "expected_revision_requires_topic", "invalid_expected_revision"],
        }},
    }))
'''


class BootstrapTest(unittest.TestCase):
    def run_bootstrap(
        self,
        capability="present",
        agents_md=None,
        brew_managed=True,
        opencode_installed=True,
        codegraph_installed=True,
        plugin_validator=None,
        prompt_validator=None,
        agents_source=None,
        stale_dcp=False,
        post_deploy_validator=None,
        existing_config=True,
        package_metadata=False,
        deployment_rsync_failure=False,
        plugin_manifest=None,
    ):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        base = Path(temp.name)
        home = base / "home"
        bin_dir = base / "bin"
        config = home / ".config" / "opencode"
        existing_backup = home / ".config" / "opencode.backup.existing"
        log = base / "commands.log"
        bin_dir.mkdir(parents=True)
        if existing_config:
            config.mkdir(parents=True)
        existing_backup.mkdir(parents=True)
        if existing_config:
            (config / "keep.txt").write_text("active-before\n")
        (existing_backup / "keep.txt").write_text("backup-before\n")
        if agents_md is not None:
            config.mkdir(parents=True, exist_ok=True)
            (config / "AGENTS.md").write_text(agents_md)
        if stale_dcp:
            (config / "dcp.jsonc").write_text('{"enabled": true}\n')
            (config / ".dcp-config-version").write_text("2\n")
        if package_metadata:
            (config / "package.json").write_text('{"live": "package"}\n')
            (config / "package-lock.json").write_text('{"live": "package-lock"}\n')
            (config / "bun.lock").write_text("live bun lock\n")
            module = config / "node_modules" / "live-module" / "index.js"
            module.parent.mkdir(parents=True)
            module.write_text("export default 'live module';\n")

        engram = bin_dir / "engram-stub"
        engram.write_text(textwrap.dedent(ENGRAM_STUB))
        engram.chmod(0o755)
        executable_names = ["codegraph"] if codegraph_installed else []
        for name in executable_names:
            executable = bin_dir / name
            executable.write_text("#!/bin/sh\nexit 0\n")
            executable.chmod(0o755)
        formula_prefix = base / "homebrew" / "Cellar" / "opencode" / "1.0"
        formula_bin = formula_prefix / "bin" / "opencode"
        formula_bin.parent.mkdir(parents=True)
        formula_bin.write_text("#!/bin/sh\nexit 0\n")
        formula_bin.chmod(0o755)
        if opencode_installed:
            opencode = bin_dir / "opencode"
            if brew_managed:
                opencode.symlink_to(formula_bin)
            else:
                opencode.write_text("#!/bin/sh\nexit 0\n")
                opencode.chmod(0o755)
        date = bin_dir / "date"
        date.write_text("#!/bin/sh\nprintf '%s\\n' 20260713-120000\n")
        date.chmod(0o755)
        brew = bin_dir / "brew"
        brew.write_text(textwrap.dedent("""\
            #!/bin/sh
            if [ "$1 $2 $3" = "list --formula opencode" ]; then
              [ "${FORMULA_INSTALLED:-0}" = 1 ]
              exit
            fi
            if [ "$1 $2" = "--prefix opencode" ]; then
              printf '%s\n' "$FORMULA_PREFIX"
              exit 0
            fi
            if [ "$1 $2" = "upgrade opencode" ]; then
              printf '%s\n' 'brew upgrade opencode' >> "$COMMAND_LOG"
              exit 0
            fi
            exit 1
            """))
        brew.chmod(0o755)
        npm = bin_dir / "npm"
        npm.write_text("#!/bin/sh\nprintf '%s\\n' 'npm install codegraph' >> \"$COMMAND_LOG\"\n")
        npm.chmod(0o755)
        for name in ("node", "python3", "rsync"):
            resolved = shutil.which(name)
            if resolved and not (bin_dir / name).exists():
                (bin_dir / name).symlink_to(resolved)

        real_rsync = shutil.which("rsync")
        if deployment_rsync_failure:
            if real_rsync is None:
                self.fail("rsync is required for the deployment failure test")
            rsync = bin_dir / "rsync"
            rsync.unlink(missing_ok=True)
            rsync.write_text("#!/usr/bin/env python3\n" + textwrap.dedent(r'''
                import os
                from pathlib import Path
                import sys

                destination = Path(sys.argv[-1]).resolve()
                fail_destination = Path(os.environ["RSYNC_FAIL_DESTINATION"]).resolve()
                state = Path(os.environ["RSYNC_FAILURE_STATE"])
                if destination == fail_destination and not state.exists():
                    state.write_text("failed\n")
                    destination.mkdir(parents=True, exist_ok=True)
                    (destination / "partial-only.txt").write_text("partial\n")
                    (destination / "opencode.json").write_text("partial\n")
                    (destination / "keep.txt").unlink(missing_ok=True)
                    raise SystemExit(23)

                os.execv(os.environ["REAL_RSYNC"], [os.environ["REAL_RSYNC"], *sys.argv[1:]])
                ''').lstrip())
            rsync.chmod(0o755)

        env = os.environ.copy()
        env.update({
            "HOME": str(home),
            "ENGRAM_BIN": str(engram),
            "PATH": f"{bin_dir}:/usr/bin:/bin",
            "STUB_CAPABILITY": capability,
            "FORMULA_INSTALLED": "1",
            "FORMULA_PREFIX": str(formula_prefix),
            "COMMAND_LOG": str(log),
        })
        if deployment_rsync_failure:
            env.update({
                "REAL_RSYNC": str(real_rsync),
                "RSYNC_FAIL_DESTINATION": str(config),
                "RSYNC_FAILURE_STATE": str(base / "rsync-failure.state"),
            })
        if plugin_validator is not None:
            env["PLUGIN_VALIDATOR"] = str(plugin_validator)
        if prompt_validator is not None:
            env["PROMPT_VALIDATOR"] = str(prompt_validator)
        if post_deploy_validator is not None:
            env["POST_DEPLOY_VALIDATOR"] = str(post_deploy_validator)
        if agents_source is not None:
            env["AGENTS_SOURCE"] = str(agents_source)
        if plugin_manifest is not None:
            manifest = base / "plugin-dependencies.json"
            manifest.write_text(plugin_manifest)
            env["PLUGIN_MANIFEST"] = str(manifest)
        result = subprocess.run(
            [str(ROOT / "bin" / "bootstrap")],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
            timeout=20,
        )
        return result, config, existing_backup, home, env, log

    def test_success_deploys_native_public_config_and_removes_stale_dcp(self):
        result, config, backup, home, _, _ = self.run_bootstrap(stale_dcp=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        deployed = json.loads((config / "opencode.json").read_text())
        deployed_tui = json.loads((config / "tui.json").read_text())
        self.assertEqual(deployed["compaction"], {"auto": True, "prune": False})
        self.assertEqual(deployed_tui["plugin"], ["~/.config/opencode/tui-plugins/ai-orchestrator-logo.tsx"])
        self.assertEqual(set(deployed["mcp"]), {"context7", "engram", "codegraph", "playwright"})
        self.assertTrue(deployed["mcp"]["playwright"]["enabled"])
        self.assertEqual(
            {name for name, agent in deployed["agent"].items() if agent["mode"] == "primary"},
            {"ai-orchestrator", "ai-orchestrator-gpt", "ai-orchestrator-go"},
        )
        serialized = json.dumps(deployed).lower()
        for forbidden in ("runpod", "slack", "sentry", "clickup", "opencode-dcp"):
            self.assertNotIn(forbidden, serialized)
        plugin = (config / "plugins" / "engram.ts").read_text()
        self.assertNotIn(".engram/manifest.json", plugin)
        self.assertNotIn("sync --import", plugin)
        self.assertFalse((config / "dcp.jsonc").exists())
        self.assertFalse((config / ".dcp-config-version").exists())
        self.assertFalse((config / "keep.txt").exists())
        self.assertEqual((backup / "keep.txt").read_text(), "backup-before\n")
        generated = list((home / ".config").glob("opencode.backup.20*"))
        self.assertEqual(len(generated), 1)
        self.assertEqual((generated[0] / "keep.txt").read_text(), "active-before\n")

    def test_success_preserves_live_package_metadata_and_node_modules(self):
        result, config, _, _, _, _ = self.run_bootstrap(
            stale_dcp=True,
            package_metadata=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            (config / "package.json").read_text(),
            (ROOT / "config" / "plugin-dependencies.json").read_text(),
        )
        self.assertEqual((config / "package-lock.json").read_text(), '{"live": "package-lock"}\n')
        self.assertEqual((config / "bun.lock").read_text(), "live bun lock\n")
        self.assertEqual(
            (config / "node_modules" / "live-module" / "index.js").read_text(),
            "export default 'live module';\n",
        )
        self.assertFalse((config / "dcp.jsonc").exists())
        self.assertFalse((config / ".dcp-config-version").exists())

    def test_success_writes_package_json_equal_to_manifest(self):
        manifest = '{"private": true, "type": "module", "dependencies": {"x": "1.0.0"}}\n'
        result, config, _, _, _, _ = self.run_bootstrap(package_metadata=True, plugin_manifest=manifest)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((config / "package.json").read_text(), manifest)

    def test_invalid_manifest_fails_without_touching_live_config(self):
        invalid = '{"private": true, "type": "module", "dependencies": {"x": ""}}\n'
        result, config, backup, home, _, log = self.run_bootstrap(package_metadata=True, plugin_manifest=invalid)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid managed plugin dependency manifest", result.stderr)
        self.assertEqual((config / "package.json").read_text(), '{"live": "package"}\n')
        self.assertEqual((config / "keep.txt").read_text(), "active-before\n")
        self.assertEqual(list((home / ".config").glob("opencode.backup.20*")), [])
        self.assertFalse(log.exists())

    def test_updates_homebrew_opencode_before_deployment(self):
        result, _, _, _, _, log = self.run_bootstrap(brew_managed=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(log.read_text(), "brew upgrade opencode\n")
        self.assertLess(result.stdout.index("-> Updating OpenCode..."), result.stdout.index("-> Installing orchestrator config..."))

    def test_warns_and_skips_unrelated_opencode_when_formula_is_installed(self):
        result, _, _, _, _, log = self.run_bootstrap(brew_managed=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("installed outside Homebrew", result.stdout)
        self.assertFalse(log.exists())

    def test_warns_when_opencode_is_missing(self):
        result, _, _, _, _, log = self.run_bootstrap(opencode_installed=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("opencode not found", result.stdout)
        self.assertFalse(log.exists())

    def test_validator_failure_precedes_every_deployment_side_effect(self):
        fixture = tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False)
        self.addCleanup(lambda: Path(fixture.name).unlink(missing_ok=True))
        fixture.write("process.exit(1);\n")
        fixture.close()
        result, config, backup, home, _, log = self.run_bootstrap(plugin_validator=fixture.name)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((config / "keep.txt").read_text(), "active-before\n")
        self.assertEqual((backup / "keep.txt").read_text(), "backup-before\n")
        self.assertEqual(list((home / ".config").glob("opencode.backup.20*")), [])
        self.assertFalse(log.exists())

    def test_capability_failure_does_not_touch_config_or_backups(self):
        for capability in ("missing", "incomplete"):
            with self.subTest(capability=capability):
                result, config, backup, home, _, log = self.run_bootstrap(
                    capability=capability,
                    codegraph_installed=False,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("atomic_topic_cas", result.stderr)
                self.assertEqual((config / "keep.txt").read_text(), "active-before\n")
                self.assertEqual((backup / "keep.txt").read_text(), "backup-before\n")
                self.assertEqual(list((home / ".config").glob("opencode.backup.20*")), [])
                self.assertFalse(log.exists())

    def test_fixed_date_collision_preserves_both_backups(self):
        result, config, _, home, env, _ = self.run_bootstrap()
        self.assertEqual(result.returncode, 0, result.stderr)
        (config / "keep.txt").write_text("active-second-run\n")
        second = subprocess.run([str(ROOT / "bin" / "bootstrap")], cwd=ROOT, env=env, text=True, capture_output=True, timeout=20)
        self.assertEqual(second.returncode, 0, second.stderr)
        backups = sorted((home / ".config").glob("opencode.backup.20260713-120000*"))
        self.assertEqual(len(backups), 2)
        self.assertEqual((backups[0] / "keep.txt").read_text(), "active-before\n")
        self.assertEqual((backups[1] / "keep.txt").read_text(), "active-second-run\n")

    def test_agents_splice_preserves_user_regions_adds_pr_gate_and_is_idempotent(self):
        live = textwrap.dedent("""\
            <!-- ai-orchestrator:persona -->
            ## Rules

            - MY CUSTOM PERSONA RULE.
            <!-- /ai-orchestrator:persona -->

            Freeform user text.

            ## Request Interpretation and Answer Shape

            Do not call memory tools before answering a simple binary question.
            After request interpretation confirms a project task, retrieve project memory.

            <!-- ai-orchestrator:engram-protocol -->
            stale engram
            <!-- /ai-orchestrator:engram-protocol -->

            <!-- ai-orchestrator:evidence-first-delegation -->
            stale DCP-era policy
            <!-- /ai-orchestrator:evidence-first-delegation -->
            """)
        result, config, _, _, env, _ = self.run_bootstrap(agents_md=live)
        self.assertEqual(result.returncode, 0, result.stderr)
        spliced = (config / "AGENTS.md").read_text()
        self.assertIn("MY CUSTOM PERSONA RULE.", spliced)
        self.assertIn("Freeform user text.", spliced)
        self.assertIn("PR assignment gate", spliced)
        self.assertIn("### CONTEXT PREFLIGHT", spliced)
        self.assertNotIn("stale engram", spliced)
        self.assertNotIn("evidence-first-delegation", spliced)
        self.assertNotIn("stale DCP-era policy", spliced)
        second = subprocess.run([str(ROOT / "bin" / "bootstrap")], cwd=ROOT, env=env, text=True, capture_output=True, timeout=20)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual((config / "AGENTS.md").read_text(), spliced)

    def test_agents_splice_rejects_malformed_live_markers_without_changing_file(self):
        malformed_files = (
            "before\n<!-- ai-orchestrator:engram-protocol -->\nunterminated\nafter\n",
            "before\n<!-- /ai-orchestrator:engram-protocol -->\nafter\n",
            "<!-- /ai-orchestrator:engram-protocol -->\n<!-- ai-orchestrator:engram-protocol -->\n",
            "<!-- ai-orchestrator:engram-protocol -->\n<!-- ai-orchestrator:engram-protocol -->\n<!-- /ai-orchestrator:engram-protocol -->\n",
            "before\n<!-- ai-orchestrator:engram-protocol  -->\nafter\n",
        )
        for live in malformed_files:
            with self.subTest(live=live):
                result, config, backup, home, _, log = self.run_bootstrap(
                    agents_md=live,
                    codegraph_installed=False,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("refusing to merge malformed AGENTS.md", result.stderr)
                self.assertEqual((config / "AGENTS.md").read_text(), live)
                self.assertEqual((config / "keep.txt").read_text(), "active-before\n")
                self.assertEqual((backup / "keep.txt").read_text(), "backup-before\n")
                self.assertEqual(list((home / ".config").glob("opencode.backup.20*")), [])
                self.assertFalse(log.exists())

    def test_agents_splice_rejects_malformed_source_without_changing_live_file(self):
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as fixture:
            source = (ROOT / "config" / "AGENTS.md").read_text()
            fixture.write(source.replace("<!-- /ai-orchestrator:engram-protocol -->", "", 1))
            source_path = Path(fixture.name)
        self.addCleanup(lambda: source_path.unlink(missing_ok=True))
        live = "user-owned content\n"
        result, config, backup, home, _, log = self.run_bootstrap(
            agents_md=live,
            agents_source=source_path,
            codegraph_installed=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("refusing to merge malformed AGENTS.md", result.stderr)
        self.assertEqual((config / "AGENTS.md").read_text(), live)
        self.assertEqual((config / "keep.txt").read_text(), "active-before\n")
        self.assertEqual((backup / "keep.txt").read_text(), "backup-before\n")
        self.assertEqual(list((home / ".config").glob("opencode.backup.20*")), [])
        self.assertFalse(log.exists())

    def test_post_deployment_validation_failure_restores_previous_config(self):
        fixture = tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False)
        self.addCleanup(lambda: Path(fixture.name).unlink(missing_ok=True))
        fixture.write("process.exit(1);\n")
        fixture.close()
        live = (ROOT / "config" / "AGENTS.md").read_text() + "\nuser-owned AGENTS content\n"
        result, config, backup, home, _, log = self.run_bootstrap(
            agents_md=live,
            stale_dcp=True,
            post_deploy_validator=fixture.name,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("restoring previous config", result.stdout)
        self.assertEqual((config / "keep.txt").read_text(), "active-before\n")
        self.assertEqual((config / "AGENTS.md").read_text(), live)
        self.assertEqual((config / "dcp.jsonc").read_text(), '{"enabled": true}\n')
        self.assertEqual((config / ".dcp-config-version").read_text(), "2\n")
        self.assertEqual((backup / "keep.txt").read_text(), "backup-before\n")
        generated = list((home / ".config").glob("opencode.backup.20*"))
        self.assertEqual(len(generated), 1)
        self.assertEqual((generated[0] / "keep.txt").read_text(), "active-before\n")
        self.assertEqual(log.read_text(), "brew upgrade opencode\n")

    def test_post_deployment_validation_failure_removes_fresh_install(self):
        fixture = tempfile.NamedTemporaryFile("w", suffix=".mjs", delete=False)
        self.addCleanup(lambda: Path(fixture.name).unlink(missing_ok=True))
        fixture.write("process.exit(1);\n")
        fixture.close()
        result, config, backup, home, _, _ = self.run_bootstrap(
            existing_config=False,
            post_deploy_validator=fixture.name,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(config.exists())
        self.assertEqual((backup / "keep.txt").read_text(), "backup-before\n")
        self.assertEqual(list((home / ".config").glob("opencode.backup.20*")), [])

    def test_deployment_copy_failure_restores_existing_config_exactly(self):
        result, config, backup, home, _, _ = self.run_bootstrap(
            package_metadata=True,
            deployment_rsync_failure=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deployment copy FAILED", result.stdout)
        self.assertEqual(
            {
                path.relative_to(config).as_posix(): path.read_bytes()
                for path in config.rglob("*")
                if path.is_file()
            },
            {
                "keep.txt": b"active-before\n",
                "package.json": b'{"live": "package"}\n',
                "package-lock.json": b'{"live": "package-lock"}\n',
                "bun.lock": b"live bun lock\n",
                "node_modules/live-module/index.js": b"export default 'live module';\n",
            },
        )
        self.assertEqual((backup / "keep.txt").read_text(), "backup-before\n")
        generated = list((home / ".config").glob("opencode.backup.20*"))
        self.assertEqual(len(generated), 1)
        self.assertEqual((generated[0] / "keep.txt").read_text(), "active-before\n")

    def test_deployment_copy_failure_removes_partial_fresh_install(self):
        result, config, backup, home, _, _ = self.run_bootstrap(
            existing_config=False,
            deployment_rsync_failure=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deployment copy FAILED", result.stdout)
        self.assertFalse(config.exists())
        self.assertEqual((backup / "keep.txt").read_text(), "backup-before\n")
        self.assertEqual(list((home / ".config").glob("opencode.backup.20*")), [])

    def test_install_engram_only_early_exits_for_exact_capable_pin(self):
        for version, capability, should_exit in (
            ("engram 1.20.0-cas.4", "present", True),
            ("engram 1.20.0-cas.3", "present", False),
            ("engram 1.19.0", "present", False),
            ("engram 1.20.0-cas.4", "missing", False),
        ):
            with self.subTest(version=version, capability=capability):
                with tempfile.TemporaryDirectory() as temp:
                    base = Path(temp)
                    bin_dir = base / "bin"
                    home = base / "home"
                    data = home / ".engram" / "memory.db"
                    bin_dir.mkdir()
                    data.parent.mkdir(parents=True)
                    data.write_text("keep\n")
                    engram = bin_dir / "engram"
                    engram.write_text(textwrap.dedent(ENGRAM_STUB))
                    engram.chmod(0o755)
                    uname = bin_dir / "uname"
                    uname.write_text("#!/bin/sh\nprintf '%s\\n' Linux\n")
                    uname.chmod(0o755)
                    env = os.environ.copy()
                    env.update({
                        "HOME": str(home),
                        "PATH": f"{bin_dir}:{env['PATH']}",
                        "STUB_ENGRAM_VERSION": version,
                        "STUB_CAPABILITY": capability,
                    })
                    result = subprocess.run([str(ROOT / "bin" / "install-engram")], cwd=ROOT, env=env, text=True, capture_output=True)
                    self.assertEqual(result.returncode == 0, should_exit)
                    self.assertEqual(data.read_text(), "keep\n")

    def test_archive_report_contract_remains_intact(self):
        archive = (ROOT / "config" / "skills" / "sdd-archive" / "SKILL.md").read_text()
        persistence = (ROOT / "config" / "skills" / "_shared" / "persistence-contract.md").read_text()
        status = (ROOT / "config" / "skills" / "_shared" / "sdd-status-contract.md").read_text()
        for contract in (archive, persistence):
            self.assertIn("expected_revision: 0", contract)
            self.assertIn("revision_conflict", contract)
            self.assertIn("mem_get_observation", contract)
            self.assertIn("parent metadata", contract)
        self.assertIn("Artifact table with every topic key and observation ID", archive)
        self.assertIn("exact artifact observation-ID lineage", persistence)
        self.assertIn("artifactObservationIds", status)
        self.assertIn("versionObservationId", status)
        self.assertIn("versionSyncId", status)


if __name__ == "__main__":
    unittest.main()
