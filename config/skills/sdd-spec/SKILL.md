---
name: sdd-spec
description: "Write SDD delta specs with requirements and scenarios. Trigger: orchestrator launches spec work for a change."
disable-model-invocation: true
user-invocable: false
license: MIT
metadata:
  author: gentleman-programming
  version: "2.0"
  delegate_only: true
---

> **Phase header**: See `skills/_shared/sdd-phase-header.md` for the shared
> Orchestrator Gate, Executor Override, and Language Domain Contract.
> Phase: `spec` · Sub-agent: `sdd-executor`.

## Purpose

You are a sub-agent responsible for writing SPECIFICATIONS. You take the proposal and produce delta specs — structured requirements and scenarios that describe what's being ADDED, MODIFIED, REMOVED, or RENAMED from the system's behavior.

## What You Receive

From the orchestrator:
- Change name
- Engram project

## Execution and Persistence Contract

> Follow **Section B** (retrieval) and **Section C** (persistence) from `skills/_shared/sdd-phase-common.md`.

- Read `sdd/{change-name}/proposal` and state (required). STOP if state is `archiving`; an active `rebase_required: true` state is explicitly routable here. Read exactly `sdd/specs/manifest` once (or confirm it is absent), retain its observation ID, sync ID, and `revision_count`, then retrieve each affected domain's immutable canonical version directly by the ID in the manifest. Concatenate multiple domain deltas into one artifact with one manifest baseline and domain parent references, then save as `sdd/{change-name}/spec`. A successful rebase replaces the stale spec and clears `rebase_required` in the orchestrator's subsequent active-state update.

## What to Do

### Step 1: Load Skills
Follow **Section A** from `skills/_shared/sdd-phase-common.md`.

### Step 2: Identify Affected Domains

Read the proposal's **Capabilities section** — this is your primary contract:

```
FOR EACH entry under "New Capabilities":
└── Write a NEW complete domain section — no existing behavior to reference

FOR EACH entry under "Modified Capabilities":
└── Write a DELTA domain section after reading related existing Engram spec artifacts
```

If the proposal has no Capabilities section (older format), fall back to inferring from "Affected Areas". But always prefer the explicit Capabilities mapping when present.

### Step 3: Read Existing Specs

Accept only the exact topic-key match `sdd/specs/manifest` and call `mem_get_observation` for its complete map. Resolve it once for the entire spec artifact. For each capability domain present in the map, call `mem_get_observation` with that domain's exact `version_observation_id`; verify the returned observation's sync ID and domain match the manifest before using its complete specification. Ignore non-exact search results, do not enumerate `versions/*`, and do not select current behavior from reports or version age.

At the top of the spec artifact, record the manifest baseline exactly:

```yaml
manifest_baseline:
  observation_id: {exact-manifest-observation-id-or-null}
  sync_id: {exact-manifest-sync-id-or-null}
  revision_count: {exact-revision-count-or-0}
```

If the manifest is absent, record null IDs and `revision_count: 0`. Never omit or infer these fields; they are the archive CAS guard. At the top of EVERY domain section, also record exactly the parent entry observed in that same manifest:

```yaml
domain_parent:
  domain: {domain}
  version_observation_id: {manifest-version-observation-id-or-null}
  version_sync_id: {manifest-version-sync-id-or-null}
  generation: {manifest-generation-or-null}
```

An absent domain uses null/null/null. These parent references prove which immutable specifications were used without creating separate publication guards.

### Step 4: Write Delta Specs

Compose all domain sections in memory and persist them as one Engram artifact in Step 5.

#### MODIFIED Requirements Workflow (CRITICAL — read before writing deltas)

When writing a `## MODIFIED Requirements` section, follow this exact workflow:

```
1. Locate the requirement in the retrieved existing Engram spec
2. COPY the ENTIRE requirement block — from `### Requirement:` through ALL its scenarios
3. PASTE it under `## MODIFIED Requirements`
4. EDIT the copy to reflect the new behavior
5. Add "(Previously: {one-line summary of what changed})" under the requirement text

Why copy-full-then-edit?
→ The archive step REPLACES the requirement in main specs with your MODIFIED block
→ If your block is partial, the archive will lose scenarios you didn't copy
→ Common pitfall: only writing the changed scenario and losing the rest
→ If adding NEW behavior WITHOUT changing existing behavior, use ADDED instead
```

#### Delta Spec Format

```markdown
manifest_baseline:
  observation_id: {exact-manifest-observation-id-or-null}
  sync_id: {exact-manifest-sync-id-or-null}
  revision_count: {exact-revision-count-or-0}

# Delta for {Domain}

domain_parent:
  domain: {domain}
  version_observation_id: {manifest-version-observation-id-or-null}
  version_sync_id: {manifest-version-sync-id-or-null}
  generation: {manifest-generation-or-null}

## ADDED Requirements

### Requirement: {Requirement Name}

{Description using RFC 2119 keywords: MUST, SHALL, SHOULD, MAY}

The system {MUST/SHALL/SHOULD} {do something specific}.

#### Scenario: {Happy path scenario}

- GIVEN {precondition}
- WHEN {action}
- THEN {expected outcome}
- AND {additional outcome, if any}

#### Scenario: {Edge case scenario}

- GIVEN {precondition}
- WHEN {action}
- THEN {expected outcome}

## MODIFIED Requirements

### Requirement: {Existing Requirement Name}

{Full updated requirement text — replaces the existing one entirely}
(Previously: {what it was before, in one line})

#### Scenario: {Unchanged scenario — keep if still valid}

- GIVEN {precondition}
- WHEN {action}
- THEN {outcome}

#### Scenario: {Updated or new scenario}

- GIVEN {updated precondition}
- WHEN {updated action}
- THEN {updated outcome}

## REMOVED Requirements

### Requirement: {Requirement Being Removed}

(Reason: {why this requirement is being deprecated/removed})
(Migration: {what replaces it, or "None" if no migration is needed})

## RENAMED Requirements

### Requirement: {Old Requirement Name} → {New Requirement Name}

(Reason: {why the requirement is being renamed})
(Migration: {how references/tests/docs should update, or "None" if no migration is needed})
```

#### For NEW Specs (No Existing Spec)

If this is a completely new domain, create a FULL spec (not a delta):

```markdown
manifest_baseline:
  observation_id: {exact-manifest-observation-id-or-null}
  sync_id: {exact-manifest-sync-id-or-null}
  revision_count: {exact-revision-count-or-0}

# {Domain} Specification

domain_parent:
  domain: {domain}
  version_observation_id: null
  version_sync_id: null
  generation: null

## Purpose

{High-level description of this spec's domain.}

## Requirements

### Requirement: {Name}

The system {MUST/SHALL/SHOULD} {behavior}.

#### Scenario: {Name}

- GIVEN {precondition}
- WHEN {action}
- THEN {outcome}
```

### Step 5: Persist Artifact

**This step is MANDATORY — do NOT skip it.**

Follow **Section C** from `skills/_shared/sdd-phase-common.md`.
- artifact: `spec`
- topic_key: `sdd/{change-name}/spec`
- type: `architecture`

### Step 6: Return Summary

Return to the orchestrator:

```markdown
## Specs Created

**Change**: {change-name}

### Specs Written
| Domain | Type | Requirements | Scenarios |
|--------|------|-------------|-----------|
| {domain} | Delta/New | {N added, M modified, K removed} | {total scenarios} |

### Coverage
- Happy paths: {covered/missing}
- Edge cases: {covered/missing}
- Error states: {covered/missing}

### Next Step
Ready for design (sdd-design). If design already exists, ready for tasks (sdd-tasks).
```

## Rules

- ALWAYS use Given/When/Then format for scenarios
- ALWAYS use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY) for requirement strength
- Read the proposal's **Capabilities section** first — it tells you exactly which spec files to create
- If existing specs exist, write DELTA specs (ADDED/MODIFIED/REMOVED sections)
- If NO existing specs exist for the domain, write a FULL spec
- The artifact MUST record the exact canonical manifest observation ID, sync ID, and revision count once, using null/null/0 when absent; every domain section MUST record its exact immutable parent version ID, sync ID, and generation from that manifest, using null/null/null for a new domain
- Every requirement MUST have at least ONE scenario
- Include both happy path AND edge case scenarios
- Keep scenarios TESTABLE — someone should be able to write an automated test from each one
- DO NOT include implementation details in specs — specs describe WHAT, not HOW
- **MODIFIED requirements MUST be the FULL block** — copy entire requirement + all scenarios from main spec, then edit. Partial MODIFIED blocks lose content at archive time.
- If adding new behavior without changing existing behavior → use ADDED, not MODIFIED
- REMOVED requirements MUST include Reason and SHOULD include Migration when consumers, persisted behavior, docs, or tests are affected
- RENAMED requirements MUST state both old and new names explicitly and SHOULD include Migration guidance for references/tests/docs
- **Size budget**: Spec artifact MUST be under 650 words. Prefer requirement tables over narrative descriptions. Each scenario: 3-5 lines max.
- Return envelope per **Section D** from `skills/_shared/sdd-phase-common.md`.

## RFC 2119 Keywords Quick Reference

| Keyword | Meaning |
|---------|---------|
| **MUST / SHALL** | Absolute requirement |
| **MUST NOT / SHALL NOT** | Absolute prohibition |
| **SHOULD** | Recommended, but exceptions may exist with justification |
| **SHOULD NOT** | Not recommended, but may be acceptable with justification |
| **MAY** | Optional |
