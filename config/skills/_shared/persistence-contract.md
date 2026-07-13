# Persistence Contract (shared across all SDD skills)

## Required Backend

Engram is the mandatory SDD artifact backend. The orchestrator never asks the user to choose an artifact store and never creates repository-local planning artifacts.

Every artifact uses a deterministic project-scoped topic key:

```text
sdd-init/{project}
sdd/{project}/testing-capabilities
sdd/{change-name}/{explore|proposal|spec|design|tasks|apply-progress|verify-report|state}
sdd/{change-name}/archive-report/{archive-generation}
sdd/specs/{domain}/versions/{change-name}/{archive-generation}
sdd/specs/manifest
```

Set `capture_prompt: false` for automated SDD artifacts when supported. If an older tool schema does not expose the field, omit it rather than failing.

SDD requires an Engram release whose `mem_save` tool schema exposes atomic `expected_revision` compare-and-swap and whose save result exposes `id`, `sync_id`, and `revision_count`. Unlike optional `capture_prompt`, missing CAS support is a hard blocker.

## State Persistence

After each successful non-archive phase transition, the orchestrator creates or upserts DAG state with `topic_key: "sdd/{change-name}/state"`, `state: active`, the completed phase, and current DAG progress containing each artifact's status and observation ID. Recover and preserve existing state with `mem_search`, then call `mem_get_observation` for the full observation before parsing or updating it. Persisting the phase artifact without this state update is not a completed transition. Before archive writes, archive persists `state: archiving` with a generation greater than `last_archived_generation`; a reopen may reserve that generation in advance. Only that same generation may later become `archived`.

Change artifacts become immutable when their state becomes archived. Archive first creates one immutable topic per affected domain and archive generation at `sdd/specs/{domain}/versions/{change-name}/{archive-generation}`. Only after every immutable version exists and exactly matches the planned generation set may archive atomically replace the stable `sdd/specs/manifest` with one `mem_save(expected_revision: <recorded-manifest-revision>)`. The manifest is the sole canonical pointer and maps every domain, including unaffected domains, to its immutable version topic, observation ID, sync_id, and generation. Same-generation versions are never updated. Every generation-scoped archive report, including one reconstructed during recovery, is created with `mem_save(expected_revision: 0)` so it cannot overwrite an existing report.

```yaml
revision_count: <baseline-manifest-revision-plus-one>
domains:
  <domain>:
    topic_key: sdd/specs/<domain>/versions/<change-name>/<archive-generation>
    observation_id: <immutable-version-id>
    sync_id: <immutable-version-sync-id>
    generation: <archive-generation>
  <unaffected-domain>:
    topic_key: <preserved-immutable-version-topic>
    observation_id: <preserved-immutable-version-id>
    sync_id: <preserved-immutable-version-sync-id>
    generation: <preserved-generation>
```

Current domain state is only the domain entry in the full `sdd/specs/manifest`, or absent when the manifest or entry does not exist. Every change spec MUST retrieve that exact manifest in full and persist its observation ID, sync_id, revision_count (`0` when absent), and the referenced immutable version metadata for every affected domain. Archive may publish only the complete generation set with one manifest CAS. A CAS conflict publishes no domain canonically: mark the generation aborted/conflicted, restore `state: active` with `phase: rebase-required`, clear current archive references and any reopen reservation metadata, and permit `sdd-spec` to rerun. Versions from the aborted generation are non-canonical evidence and MUST NOT be promoted by history scans. After publication, same-generation recovery validates only affected domains: each current ref may be the exact generation version or a descendant whose immutable parent chain reaches it. Unaffected-domain changes and unrelated manifest revisions do not invalidate publication. Once those refs and all source, version, and CAS-result evidence are validated, an absent same-generation archive report is deterministically created with `expected_revision: 0` from that evidence, the publication revision (baseline revision plus one), and persisted `archive_started_at`. If creation returns `revision_conflict`, retrieve the winner from the exact generation report topic, call `mem_get_observation` for its full content, and finalize only when its generation, complete artifact/source observation-ID set, and complete immutable-version topic/ID/sync_id/parent lineage exactly match; otherwise block. Retry-time values are never used. A missing affected ref or unrelated parent chain is a true conflict; abort that generation, clear the reopened reservation, and rebase.

Reopening an archived change increments `archive_generation` above preserved `last_archived_generation`, sets `archive_generation_status: pending`, `state: active`, and `phase: reopened`, records the reopen time/reason, and clears current archive references. The next archive reuses that reserved generation rather than incrementing again. A true recovery conflict sets that generation to `aborted-conflicted`, restores active/rebase-required, and clears `reopened_at`, `reopen_reason`, and current archive references so the reservation cannot be reused. After spec rebases, the next archive increments beyond it. Older reports and versions remain immutable history. Finalization-only recovery is valid only from `state: archiving` when every affected manifest ref is the exact generation version or a descendant whose immutable parent chain reaches it and the sources, versions, and lineage all match; the same-generation report is validated when present or deterministically created when absent before finalization.

## Sub-Agent Context Rules

Sub-agents launch with fresh context and no implicit access to the orchestrator's conversation.

- For non-SDD work, the orchestrator searches Engram and passes only relevant context.
- For SDD phases, the executor retrieves dependencies directly by topic key and persists its own output.
- A phase without dependencies still persists its output before returning.
- Search results are previews. Executors MUST call `mem_get_observation` for every dependency.

## Launch Prompt: SDD With Dependencies

```text
Read these artifacts before starting:
  mem_search(query: "sdd/{change-name}/{type}", project: "{project}") -> get ID
  mem_get_observation(id: {id}) -> full content (REQUIRED)

PERSISTENCE (MANDATORY):
After completing the phase, call mem_save with:
  title/topic_key: sdd/{change-name}/{artifact-type}
  type: architecture
  project: {project}
  scope: project
  capture_prompt: false
  content: {full artifact markdown}
```

## Launch Prompt: SDD Without Dependencies

Use the same persistence block without retrieval instructions. If the executor returns without saving, downstream phases cannot continue.

## Response Ordering

Persistence MUST happen before the final text response. The final output must be the phase response envelope, never a tool result. Sub-agents must not call `mem_session_summary`; that is reserved for top-level agents.

## Skill Registry

The orchestrator injects exact skill paths as `## Skills to load before work`. Executors use those paths first, then `SKILL: Load`, then the Engram `skill-registry` observation or `.atl/skill-registry.md` fallback.

## Detail Level

`detail_level: concise | standard | deep` controls response verbosity, not artifact completeness. Always persist the full artifact.
