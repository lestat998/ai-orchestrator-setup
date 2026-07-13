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
- Project name

## Execution and Persistence Contract

> Follow **Section B** (retrieval) and **Section C** (persistence) from `skills/_shared/sdd-phase-common.md`.

- Read `sdd/{change-name}/proposal` (required). Retrieve exactly `sdd/specs/manifest` in full, or establish that exact topic is absent. Record its observation ID, sync_id, and revision_count (`0` when absent), plus each affected domain's immutable version reference from that same manifest, as one baseline. Concatenate multiple domain deltas into one artifact with domain headers. Save as `sdd/{change-name}/spec`.

## What to Do

### Step 1: Load Skills
Follow **Section A** from `skills/_shared/sdd-phase-common.md`.

### Step 2: Identify Affected Domains

Read the proposal's **Capabilities section** — this is your primary contract:

```
FOR EACH entry under "New Capabilities":
├── This becomes a NEW full domain section
└── Write a complete spec — no existing behavior to reference

FOR EACH entry under "Modified Capabilities":
├── This becomes a DELTA domain section
└── Retrieve the latest relevant Engram spec first
```

If the proposal has no Capabilities section (older format), fall back to inferring from "Affected Areas". But always prefer the explicit Capabilities mapping when present.

### Step 3: Read Existing Specs

Search for the exact topic key `sdd/specs/manifest` and retrieve that one observation in full once. Require its `revision_count` to match observation metadata and every domain entry to contain immutable version topic, observation ID, sync_id, and generation. For each affected domain, retrieve the exact immutable version referenced by its manifest entry to read the complete canonical specification. If the manifest or that domain entry is absent, the domain is new. Never scan or enumerate immutable version topics to reconstruct current state.

At the start of the spec artifact, persist one exact manifest baseline and the affected domain references derived from it:

```yaml
specBaseline:
  manifestTopicKey: sdd/specs/manifest
  manifestObservationId: <exact-manifest-observation-id>
  manifestSyncId: <exact-manifest-sync-id>
  manifestRevisionCount: <exact-positive-integer>
  domains:
    {domain}:
      versionTopicKey: <immutable-version-topic>
      versionObservationId: <immutable-version-observation-id>
      versionSyncId: <immutable-version-sync-id>
      generation: <archive-generation>
      resolution: current
```

or, when no version observation exists:

```yaml
specBaseline:
  manifestTopicKey: sdd/specs/manifest
  manifestObservationId: null
  manifestSyncId: null
  manifestRevisionCount: 0
  domains:
    {domain}:
      versionTopicKey: null
      versionObservationId: null
      versionSyncId: null
      generation: null
      absent: true
```

Never use a search preview, archive-report ID, title, timestamp, inferred version, or version enumeration as the baseline. The single manifest marker and every affected domain reference are required even for a new-domain full spec. A rebase MUST rerun spec against the newly retrieved canonical manifest and replace the exact CAS baseline.

### Step 4: Write Delta Specs

Compose all affected domain sections in one artifact and persist it in Step 5.

#### MODIFIED Requirements Workflow (CRITICAL — read before writing deltas)

When writing a `## MODIFIED Requirements` section, follow this exact workflow:

```
1. Locate the requirement in the retrieved current specification artifact
2. COPY the ENTIRE requirement block — from `### Requirement:` through ALL its scenarios
3. PASTE it under `## MODIFIED Requirements`
4. EDIT the copy to reflect the new behavior
5. Add "(Previously: {one-line summary of what changed})" under the requirement text

Why copy-full-then-edit?
→ Archive merges the verified delta into a new immutable domain version and records the resulting observation ID
→ If your block is partial, later changes lose scenarios you did not copy
→ Common pitfall: only writing the changed scenario and losing the rest
→ If adding NEW behavior WITHOUT changing existing behavior, use ADDED instead
```

#### Delta Spec Format

```markdown
# Delta for {Domain}

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
# {Domain} Specification

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
Ready for design (sdd-design). Spec and design may run in parallel after proposal; tasks require BOTH artifacts.
```

## Rules

- ALWAYS use Given/When/Then format for scenarios
- ALWAYS use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY) for requirement strength
- Read the proposal's **Capabilities section** first — it tells you exactly which spec files to create
- Read exactly one `sdd/specs/manifest` observation as the current baseline, then read only immutable versions referenced by its affected domain entries; never enumerate versions
- Record exact manifest observation ID, sync_id, revision_count, and all affected domain version refs, or revision `0` with explicit absent refs
- If existing specs exist, write DELTA specs (ADDED/MODIFIED/REMOVED sections)
- If NO existing specs exist for the domain, write a FULL spec
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
