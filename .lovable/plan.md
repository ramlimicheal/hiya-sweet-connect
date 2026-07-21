# Canvas → AI Product Architecture Compiler

Reframes Canvas from a fixed 15-phase prompt generator into a compiler that turns any input (idea, description, or repo URL) into a progressively-built product architecture, with explicit decision provenance and adaptive checkpoints instead of a fixed phase list.

---

## 1. Input Layer

Single input surface accepts:
- **Idea** — free text vision
- **Existing project** — description of what already exists
- **Repository URL** — public GitHub URL; server fetches `README.md` + top-level file list via GitHub public API and folds into the analysis prompt

Input type auto-detected (URL regex → repo mode); user can override.

## 2. Product DNA (expanded schema)

Replaces current `ProjectDNA` with:

```
targetUsers[]           problem                desiredOutcome
productBoundaries[]     coreFeatures[]         userRoles[]
primaryJourneys[]       nonGoals[]
```

Each field is editable inline and carries a `status` (see §4).

## 3. Architecture Model (new artifact)

Second compilation output alongside DNA:

```
screens[]               { name, purpose, entryFrom[] }
userStates[]            { state, transitions[] }
domainEntities[]        { name, fields[], relationships[] }
ownership[]             { entity, owner, rlsRule }
integrations[]          { name, purpose, auth, dataFlow }
aiResponsibilities[]    { task, model, fallback }
failureRecovery[]       { scenario, detection, recovery }
```

Rendered as a new **Architecture** tab.

## 4. Decision Register

Every DNA field, architecture item, and recommendation is tagged:

- `confirmed` — user explicitly approved
- `proposed` — AI suggested, awaiting review
- `assumed` — AI filled without evidence (visible warning)
- `unresolved` — flagged as needing human input

New **Decisions** tab lists all items grouped by status. One-click promote (`assumed → confirmed`) or reject (`proposed → unresolved`). AI is instructed to never silently upgrade status.

## 5. Adaptive Build Plan

Replaces static `DEFAULT_PHASES`. New server fn `planNextCheckpoint(project)` returns the **single smallest next checkpoint**, computed from:

- unresolved decisions (blocks any checkpoint that depends on them)
- dependency graph (auth before user-scoped data, schema before UI)
- risk (external integrations first when uncertain)
- existing implementation state (skip completed)
- explicit user priority flags

User sees: current checkpoint + "Why this next" reasoning + "Skip / defer" controls. On completion, user marks done and requests the next one.

## 6. Lovable Handoff Format

Each checkpoint compiles to:

```
exactGoal            allowedFiles[]         requirements[]
exclusions[]         acceptanceCriteria[]   verificationCommands[]
expectedReport       (schema for return report)
```

Replaces current free-form phase prompt. Rendered as copy-ready markdown.

## 7. Architecture Validation Gate

Before any checkpoint is presented, run `validateArchitecture(project)` which flags:

- unsupported vendor/compliance claims (regex + AI check against a small denylist)
- invalid SQL types or missing PK/FK in `domainEntities`
- entities missing ownership/RLS rule
- unresolved decisions the checkpoint depends on
- oversized checkpoints (> N requirements → split)

Any failed check → bundle labeled **Draft** with red banner listing gaps. User can override.

---

## Technical shape

- **New types** in `src/types.ts`: `ProductDNAv2`, `ArchitectureModel`, `Decision`, `Checkpoint`, `ValidationReport`, plus `DecisionStatus` union.
- **New server fns** in `src/lib/architect.functions.ts`:
  `compileDNA`, `compileArchitecture`, `planNextCheckpoint`, `validateArchitecture`, `fetchRepoContext` (public GitHub, no auth needed).
- **Migration**: add `dna_v2 jsonb`, `architecture jsonb`, `decisions jsonb`, `checkpoints jsonb`, `validation jsonb` to `projects`. Keep old `dna`/`phases` for read-only backward compat until user clears.
- **UI**: new tabs replace current 6-tab layout:
  `Input → DNA → Architecture → Decisions → Checkpoint → Validation`.
  Old Phases/Output/Canvas tabs removed.
- **Models**: `openai/gpt-5.5` for DNA + Architecture compilation, `google/gemini-3.5-flash` for validation + planning (cheap, structured). All calls counted against existing 25/day limit.
- **Prompts**: three system prompts — Architect (DNA), Systems Designer (Architecture), Auditor (Validation). Each instructed to output status tags and never silently promote assumed → confirmed.

## Deferred (explicit)

- Private repo access (needs OAuth) — public repos only
- Actual repo file-tree deep read beyond README + top-level list
- Multi-user collaboration on decisions
- Export to external planning tools

## Execution order

1. Types + migration + server fn scaffolding
2. DNA v2 compiler + editable UI
3. Architecture compiler + tab
4. Decision Register tab + status controls
5. Adaptive planner + Checkpoint tab
6. Validation gate + Draft labeling
7. Repo URL input mode

Each step lands buildable. Reply **go** to start with step 1.
