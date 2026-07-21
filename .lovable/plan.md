# Milestone 1 (Amended) — Authenticated Persistent Projects + Project DNA v2

Planning-only. No code, no auth configuration, no migrations, no test users, no database writes will be issued until this plan is approved.

Founder decisions applied throughout: Google + email/password; minimal `profiles` (display_name, avatar_url — no email duplication); 10 active projects/user cap enforced server-side; local copies kept indefinitely; closed-beta AI allowlist; public root is a functional sign-in entry only.

---

## 1. Complete inventory of existing project state (must survive migration verbatim)

Read directly from `src/lib/projects.ts`, `src/types.ts`, `src/data/phases.ts`, and the working state in `src/routes/index.tsx`.

### 1.1 `ProjectSnapshot` (localStorage key `elite_canvas_projects_v1`, list inside `ProjectsStore.projects`)

| Field | Type | Migration target |
|---|---|---|
| `id` | string (`p_<base36>_<rand>`) | `projects.metadata.local_project_id` (unique per owner) |
| `name` | string | `projects.name` |
| `createdAt` | number (ms epoch) | `projects.created_at` (converted) |
| `updatedAt` | number (ms epoch) | `projects.updated_at` (converted) |
| `idea` | string | `project_briefs.idea` (v1 row) |
| `productType` | string | `project_briefs.product_type` |
| `stage` | string | `project_briefs.stage` |
| `constraints` | string | `project_briefs.constraints` |
| `references` | string | `project_briefs.references_text` |
| `dna` | `ProjectDNA \| null` | one `dna_versions` row when non-null; `projects.current_dna_version_id` points to it |
| `phases[]` | `BuildPhase[]` (15 items from `DEFAULT_PHASES`) | one `phase_runs` row per phase where `generatedPrompt` is defined |
| `canvasOutputs[]` | `CanvasOutput[]` | `canvas_outputs` rows |

### 1.2 `ProjectDNA` fields → `dna_versions` columns

`projectName`, `readiness` (renamed `readiness_estimate int`, labeled AI estimate), `summary`, `architecture`, `features jsonb`, `userRoles jsonb` (array of `{role, permissions[]}`), `criticalDecisions jsonb` (immutable snapshot — see §2 duplicated-authority rule). Plus provenance columns not in the original type: `source enum('ai','fallback','manual')`, `model text NULL`, `fallback_reason_code text NULL` (from the allowlist already shipped in `/api/generate-phase`).

### 1.3 `BuildPhase` fields → `phase_runs` columns

`id` (phases catalog id), `number`, `title`, `description`, `requirements` are catalog-static (from `src/data/phases.ts`) and stored **once** in a read-only `phase_catalog` table seeded by the migration — not duplicated per project. Per-run mutable fields go to `phase_runs`: `generatedPrompt` → `prompt_markdown`, `status` → `status enum('idle','generating','completed','error')`, `source enum('ai','fallback')`, `model text NULL`, `fallback_reason_code text NULL`. `phase_runs.phase_id text NOT NULL REFERENCES phase_catalog(id)`.

### 1.4 `CanvasOutput` fields → `canvas_outputs` columns

`title text NOT NULL`, `content text NOT NULL`, `timestamp` (ISO string in localStorage) → `captured_at timestamptz NOT NULL`. Plus `project_id`, `created_by`, `created_at`. Every existing local `CanvasOutput` maps 1:1, lossless — no dropped fields.

### 1.5 Global settings (localStorage key `elite_canvas_settings`)

`depth`, `stack`, `motionIntensity`, `model`. Explicit decision: **stays browser-local** as a UI preference. Not migrated, not stored server-side this milestone. Documented in the "browser-local, safe to omit" list — the only category permitted to remain local. All project *content* is migrated in full.

### 1.6 Legacy localStorage keys still read by `loadStore()`

`elite_canvas_dna`, `elite_canvas_phases`, `elite_canvas_outputs`. Already merged into `ProjectSnapshot` at load time; the migration operates on the merged v1 store, so these are covered transitively.

---

## 2. Single-authority map (removes duplicated concepts)

| Concept | Sole authority | Notes |
|---|---|---|
| Immutable historical DNA snapshot (incl. `criticalDecisions` as captured at that moment) | `dna_versions` row | Never edited in place. `criticalDecisions` inside the JSONB is the historical snapshot only — not an active list. |
| Current DNA pointer | `projects.current_dna_version_id` | Only the `setCurrentDnaVersion` RPC writes it. |
| Active decision set (proposed/accepted/rejected/superseded) | `decisions` rows | UI reads active decisions ONLY from here, never from `dna_versions.critical_decisions` JSONB. |
| Generated phase prompt | `phase_runs` row | The `/api/generate-phase` handler is the only writer. |
| Canvas artifact | `canvas_outputs` row | Only `addCanvasOutput`/`deleteCanvasOutput` write it. |
| Project brief (idea, product_type, stage, constraints, references) | `project_briefs` rows, versioned | See §3. |
| Phase catalog (id, number, title, description, requirements) | `phase_catalog` rows (seeded) | Read-only for authenticated users; source of truth is `src/data/phases.ts` mirrored into the seed migration. |

UI must never dual-write `dna_versions.critical_decisions` and `decisions`. Any DNA re-analysis produces a new immutable `dna_versions` row AND (in the same transaction) inserts the initial `decisions` rows in `proposed` state derived from that snapshot.

---

## 3. Data model (amended)

New tables under `public`, all with the mandated `CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY` order in one migration.

```text
profiles
  id uuid PK = auth.users.id
  display_name text
  avatar_url text
  created_at, updated_at
  -- no email column

projects
  id uuid PK
  owner_id uuid NOT NULL              -- auth.users.id
  name text NOT NULL
  archived_at timestamptz NULL
  current_dna_version_id uuid NULL
  local_project_id text NULL          -- for one-shot migration idempotency
  created_at, updated_at
  UNIQUE (owner_id, local_project_id) WHERE local_project_id IS NOT NULL
  -- composite FK to dna_versions defined below

project_briefs                        -- versioned; append-only
  id uuid PK
  project_id uuid NOT NULL -> projects.id ON DELETE CASCADE
  version_number int NOT NULL
  idea text NOT NULL DEFAULT ''
  product_type text NOT NULL DEFAULT ''
  stage text NOT NULL DEFAULT ''
  constraints text NOT NULL DEFAULT ''
  references_text text NOT NULL DEFAULT ''
  created_by uuid, created_at
  UNIQUE (project_id, version_number)

dna_versions                          -- immutable
  id uuid PK
  project_id uuid NOT NULL -> projects.id ON DELETE CASCADE
  brief_version_id uuid NOT NULL -> project_briefs.id
  version_number int NOT NULL
  project_name text
  summary text
  architecture text
  features jsonb NOT NULL DEFAULT '[]'
  user_roles jsonb NOT NULL DEFAULT '[]'
  critical_decisions jsonb NOT NULL DEFAULT '[]'   -- historical snapshot only
  readiness_estimate int NULL
  source text NOT NULL CHECK (source IN ('ai','fallback','manual'))
  model text NULL
  fallback_reason_code text NULL
  request_key text NOT NULL           -- idempotency (see §5)
  created_by uuid, created_at
  UNIQUE (project_id, version_number)
  UNIQUE (project_id, request_key)
  UNIQUE (id, project_id)             -- enables composite FKs (§4)

decisions
  id uuid PK
  project_id uuid NOT NULL
  dna_version_id uuid NOT NULL
  title text NOT NULL
  description text
  recommendation text
  status text NOT NULL CHECK (status IN ('proposed','accepted','rejected','superseded'))
  superseded_by uuid NULL
  actor_id uuid NOT NULL
  reason text NULL
  status_changed_at timestamptz NOT NULL DEFAULT now()
  created_at
  UNIQUE (id, project_id)
  -- composite FKs enforced in §4

evidence
  id uuid PK
  project_id uuid NOT NULL
  dna_version_id uuid NULL
  decision_id  uuid NULL
  source_type text NOT NULL CHECK (source_type IN ('user_note','model_output','file_upload','url'))
  source_ref text
  excerpt text
  captured_at timestamptz NOT NULL DEFAULT now()
  CHECK (dna_version_id IS NOT NULL OR decision_id IS NOT NULL)
  -- composite FKs in §4

phase_catalog                         -- seed-only, read-only for users
  id text PK                          -- matches src/data/phases.ts ids
  number text NOT NULL
  title text NOT NULL
  description text NOT NULL
  requirements text NOT NULL
  sort_order int NOT NULL

phase_runs
  id uuid PK
  project_id uuid NOT NULL
  dna_version_id uuid NOT NULL
  phase_id text NOT NULL -> phase_catalog.id
  request_key text NOT NULL           -- idempotency
  prompt_markdown text
  status text NOT NULL CHECK (status IN ('idle','generating','completed','error'))
  source text NULL CHECK (source IS NULL OR source IN ('ai','fallback'))
  model text NULL
  fallback_reason_code text NULL
  created_by uuid, created_at, updated_at
  UNIQUE (project_id, dna_version_id, phase_id, request_key)

canvas_outputs
  id uuid PK
  project_id uuid NOT NULL
  title text NOT NULL
  content text NOT NULL
  captured_at timestamptz NOT NULL
  created_by uuid, created_at

import_batches
  id uuid PK
  user_id uuid NOT NULL
  import_id text NOT NULL             -- client-generated
  payload_hash text NOT NULL          -- SHA-256 of validated payload
  status text NOT NULL CHECK (status IN ('started','completed','failed'))
  project_count int NOT NULL DEFAULT 0
  brief_count int NOT NULL DEFAULT 0
  dna_count int NOT NULL DEFAULT 0
  phase_run_count int NOT NULL DEFAULT 0
  canvas_output_count int NOT NULL DEFAULT 0
  started_at timestamptz NOT NULL DEFAULT now()
  completed_at timestamptz NULL
  error_code text NULL                -- allowlisted codes only, no messages
  UNIQUE (user_id, import_id)
  UNIQUE (user_id, payload_hash)      -- exact-payload replay short-circuits
```

Postgres enum types not used to keep migrations reversible; CHECK constraints hold the invariants.

---

## 4. Same-project composite integrity (DB-enforced)

Plain FKs to `.id` are insufficient. Every cross-table reference that also carries `project_id` uses a composite FK to a `UNIQUE (id, project_id)` target:

- `projects.current_dna_version_id` → composite FK `(current_dna_version_id, id)` REFERENCES `dna_versions(id, project_id)`. Requires `dna_versions.UNIQUE (id, project_id)`. Added as a `DEFERRABLE INITIALLY DEFERRED` constraint so the atomic RPC in §5 can insert the DNA row and update the pointer in one transaction.
- `decisions (dna_version_id, project_id)` composite FK → `dna_versions (id, project_id)`.
- `evidence (dna_version_id, project_id)` composite FK → `dna_versions (id, project_id)` (allowed NULL only when `decision_id` is not null; enforced via matching partial FK).
- `evidence (decision_id, project_id)` composite FK → `decisions (id, project_id)`.
- `phase_runs (dna_version_id, project_id)` composite FK → `dna_versions (id, project_id)`.
- `decisions.superseded_by`: composite FK `(superseded_by, project_id)` → `decisions (id, project_id)`; plus `CHECK (superseded_by IS NULL OR superseded_by <> id)` to prevent self-reference.

Every mutation path is exercised by tests (§10) that attempt cross-project substitutions and must be rejected by the database, not by the application layer.

---

## 5. Server-function authority map

All server fns live in `src/lib/*.functions.ts` (never `src/server/*` per the import-graph rules). Server-only helpers use the `*.server.ts` extension. All authenticated fns use `.middleware([requireSupabaseAuth])`. Reads use RLS; mutations that must enforce invariants use SECURITY DEFINER RPCs called from the server fn.

| Server fn | Purpose | Underlying write path |
|---|---|---|
| `listProjects` | user's projects + current DNA summary | direct SELECT (RLS) |
| `createProject({ name })` | insert `projects` row; enforce 10-active-project cap in an RPC | `rpc_create_project` |
| `renameProject` / `archiveProject` / `deleteProject` | mutate `projects` | RLS UPDATE/DELETE (name+archived_at only); DELETE cascades |
| `getProject(id)` | project + current brief + current DNA + active decisions + latest phase_runs + canvas_outputs | direct SELECT (RLS) |
| `saveBrief({ projectId, brief })` | append new `project_briefs` row (versioned) | `rpc_append_brief` (locks project, increments version) |
| `createDnaVersion({ projectId, briefVersionId, dna, request_key })` | atomic: append DNA version, seed proposed decisions, set current pointer | `rpc_create_dna_version` (§6) |
| `setCurrentDnaVersion({ projectId, dnaVersionId })` | pointer swap only, verifies same project | `rpc_set_current_dna` |
| `proposeDecision`, `acceptDecision`, `rejectDecision`, `changeDecision` | lifecycle transitions | one RPC per verb (§7) |
| `addEvidence`, `deleteEvidence` | evidence CRUD | RLS INSERT/DELETE; no UPDATE surface |
| `recordPhaseRun({ projectId, dnaVersionId, phaseId, request_key, ... })` | idempotent phase-run insert | `rpc_upsert_phase_run` |
| `addCanvasOutput` / `deleteCanvasOutput` | canvas outputs | RLS INSERT/DELETE |
| `migrateLocalProjects({ importId, payload })` | one-shot local→cloud import | `rpc_apply_import_batch` (§8) |

`/api/generate-phase` (already the only HTTP-level surface) gets `.middleware([requireSupabaseAuth])`-equivalent bearer verification and, on success, calls `recordPhaseRun` with the request's `request_key` (§9 — one canonical generation path). Unauthenticated requests receive `401` and no model call is made.

Existing `analyzeIdea`, `generatePhasePrompt`, `autowriteIdea` in `src/lib/ai.functions.ts` gain `.middleware([requireSupabaseAuth])`. `generatePhasePrompt` is gated (see §9).

---

## 6. Atomic DNA version creation (`rpc_create_dna_version`)

SECURITY DEFINER RPC with `SET search_path = public`. Called by `createDnaVersion` server fn.

Steps inside one transaction:

1. `SELECT ... FROM projects WHERE id = _project_id AND owner_id = auth.uid() FOR UPDATE` — locks the project row and asserts ownership.
2. Idempotency check: `SELECT id FROM dna_versions WHERE project_id = _project_id AND request_key = _request_key`. If found, return that row; **do not create a duplicate**.
3. `SELECT COALESCE(MAX(version_number), 0) + 1 FROM dna_versions WHERE project_id = _project_id` under the row lock — deterministic monotonic numbering safe against concurrent callers.
4. Verify `_brief_version_id` belongs to the same project.
5. `INSERT INTO dna_versions (...)` with the computed version number and `_request_key`.
6. Bulk `INSERT INTO decisions (...)` for every entry in the DNA's `criticalDecisions`, all with `status='proposed'`.
7. `UPDATE projects SET current_dna_version_id = new_version_id`.
8. `COMMIT`.

`current_dna_version_id` FK is `DEFERRABLE INITIALLY DEFERRED` so step 5 and step 7 satisfy the constraint at commit time.

Concurrent duplicate submissions with the same `request_key` cannot double-create because the row lock in step 1 serializes readers, and the `UNIQUE (project_id, request_key)` on `dna_versions` provides a belt-and-braces defense that surfaces as a caught unique-violation the RPC treats as "return existing row".

`setCurrentDnaVersion` runs its own SECURITY DEFINER RPC that asserts `dna_versions.project_id = projects.id AND projects.owner_id = auth.uid()` before the pointer swap.

---

## 7. Decision lifecycle (DB-enforced)

Direct `UPDATE` and `DELETE` on `decisions` are **revoked from authenticated** — only SELECT and INSERT (of `proposed` rows) are allowed to the authenticated role. All transitions go through SECURITY DEFINER RPCs.

State machine:

```text
proposed --accept--> accepted
proposed --reject--> rejected
accepted --supersede--> superseded  (+ new proposed row inserted atomically)
```

RPC contracts:

- `rpc_propose_decision(project_id, dna_version_id, title, description, recommendation, reason)` — inserts `status='proposed'`, records `actor_id = auth.uid()`.
- `rpc_accept_decision(id, reason)` — allowed only when current status is `proposed`; sets `status='accepted'`, `status_changed_at=now()`, `actor_id=auth.uid()`, appends `reason`.
- `rpc_reject_decision(id, reason)` — allowed only when current status is `proposed`; sets `status='rejected'` (history preserved, not deleted).
- `rpc_change_decision(old_id, new_title, new_description, new_recommendation, reason)` — atomic:
  1. Verify old row's current status is `accepted` and owner matches.
  2. Insert a new `proposed` row with the replacement content, same `project_id` + `dna_version_id`.
  3. `UPDATE` old row: `status='superseded'`, `superseded_by=new_id`, `status_changed_at=now()`.
  4. Commit.

Accepted and superseded rows are never mutated in place after the transition — enforced by an `AFTER UPDATE` trigger that rejects any UPDATE whose OLD status is `accepted` or `superseded` unless the caller is `service_role`.

Every RPC records `actor_id`, `status_changed_at`, `reason`, and `superseded_by` where applicable. UI reads history via `SELECT ... ORDER BY status_changed_at`.

---

## 8. Migration state machine (`rpc_apply_import_batch`)

Replaces the sentinel-only design. Client responsibilities:

1. Read local `elite_canvas_projects_v1` and merge legacy keys with existing `loadStore()` logic (unchanged).
2. Compute `payload_hash = sha256(canonical_json(payload))`.
3. Validate the payload with Zod against a schema covering every field in §1, with limits: `≤ 50` projects, `≤ 100 KB` per idea/summary/architecture, `≤ 100` phases per project, `≤ 200` canvas outputs per project, total serialized payload `≤ 2 MB`, string fields capped at `10 000` chars, title fields at `500`.
4. Call `migrateLocalProjects({ importId, payload })`. `importId` is client-generated, stable across retries.

Server RPC:

1. `INSERT INTO import_batches (user_id, import_id, payload_hash, status='started', ...) ON CONFLICT (user_id, import_id) DO NOTHING RETURNING *`. If a row already exists with `status='completed'` **and** matching `payload_hash`, return it unchanged (short-circuit replay).
2. If existing row has `status='completed'` **but** `payload_hash` differs → return error `payload_drift`; do not process.
3. For each incoming project:
   - `INSERT INTO projects (owner_id, local_project_id, ...) ON CONFLICT (owner_id, local_project_id) DO UPDATE SET name = EXCLUDED.name, updated_at = EXCLUDED.updated_at RETURNING id`.
   - `INSERT INTO project_briefs (project_id, version_number, ...) ON CONFLICT (project_id, version_number) DO NOTHING`. Version 1 always.
   - If `dna` non-null: call `rpc_create_dna_version` with `request_key = 'import:<importId>:<local_project_id>:dna1'`. Idempotency handles retry.
   - For each phase with `generatedPrompt`: `rpc_upsert_phase_run` with `request_key = 'import:<importId>:<local_project_id>:phase:<phaseId>'`.
   - For each canvas output: `INSERT INTO canvas_outputs (...) ON CONFLICT DO NOTHING` on natural key `(project_id, title, captured_at)`.
4. Enforce the 10-active-project cap during step 3: importing more than the cap is allowed to complete (existing user data is not thrown away), but subsequent `createProject` is blocked until user archives — documented behavior.
5. Update `import_batches` with counts, `status='completed'`, `completed_at=now()`.
6. On any failure: `status='failed'`, `error_code` from the allowlist (`payload_invalid`, `payload_too_large`, `payload_drift`, `db_unavailable`, `unknown`). No raw messages.

Client responsibilities post-response:

- Sentinel `elite-canvas:migrated:v1:<userId>:<importId>` is written **only** when the response reports `status='completed'` and counts match the client's pre-flight tally.
- Original `localStorage` data is **kept indefinitely** — never deleted this milestone.
- A manual "Import local projects" button is always visible when local data exists and the cloud store does not include a matching batch — enables user-triggered recovery.

---

## 9. One canonical generation path

Today there are two paths: the server fn `generatePhasePrompt` and the HTTP route `/api/generate-phase`. Post-milestone:

- **Canonical (kept):** `/api/generate-phase`. It authenticates via bearer verification (401 unauth), generates once, persists via `recordPhaseRun` with a client-supplied `request_key`, and returns the same `source`/`model`/`fallback_reason_code` it persisted. UI displays badges from the persisted row (already the case for the header today; extended to read from cloud).
- **Removed:** `generatePhasePrompt` server fn. Deleted from `src/lib/ai.functions.ts` and its import sites. Client no longer has a second path.

Idempotency: `phase_runs UNIQUE (project_id, dna_version_id, phase_id, request_key)` blocks double-submit duplication. A retry with the same `request_key` returns the persisted row; a retry with a new `request_key` after a client-side accident is treated as a legitimate new generation and paid for accordingly.

`analyzeIdea` (DNA) and `autowriteIdea` (idea polish) are also gated by the closed-beta allowlist (see §12).

---

## 10. Full RLS matrix

| Table | authenticated SELECT | authenticated INSERT | authenticated UPDATE | authenticated DELETE | mutations via RPC only | anon | service_role |
|---|---|---|---|---|---|---|---|
| profiles | own row | via trigger on signup | own row (display_name, avatar_url) | — | — | none | ALL |
| projects | `owner_id=auth.uid()` | RPC only (`rpc_create_project` enforces cap) | own (name, archived_at only) | own | create + `current_dna_version_id` swap | none | ALL |
| project_briefs | via owned project | RPC only (`rpc_append_brief`) | denied | denied | insert/version | none | ALL |
| dna_versions | via owned project | RPC only | denied | denied | insert (immutable after) | none | ALL |
| decisions | via owned project | own project, `status='proposed'` only via CHECK | denied | denied | propose/accept/reject/change | none | ALL |
| evidence | via owned project | via owned project (with CHECK) | own | own | — | none | ALL |
| phase_catalog | all authenticated | denied | denied | denied | seed migration only | denied | ALL |
| phase_runs | via owned project | RPC only (`rpc_upsert_phase_run`) | denied | own project | insert/update | none | ALL |
| canvas_outputs | via owned project | via owned project | denied | own | — | none | ALL |
| import_batches | own rows | RPC only | denied | denied | import machine | none | ALL |

`anon` receives **no GRANTs** on any of these tables. `service_role` gets `GRANT ALL` for admin scripts.

---

## 11. Test-isolation protocol (fail-closed)

Before any mutating integration test runs, the test harness:

1. Reads `SUPABASE_TEST_URL` and `SUPABASE_TEST_SERVICE_ROLE_KEY` from the environment (must be explicitly set — no defaulting).
2. Reads `SUPABASE_URL` (Live).
3. Extracts the project ref from each URL. If either is missing, or refs are equal, or `SUPABASE_TEST_URL === SUPABASE_URL` — **abort with a non-zero exit and the message "test-isolation-failed"**. Never fall back to Live credentials.
4. Confirms the Test project's `projects` table returns 0 rows before seeding — refuses to run if not empty (protects against pointing at a shared preview environment).
5. Runs the suite against the Test project; tears down seeded rows in a `BEGIN ... ROLLBACK` where possible.

If Test isolation is not available (no `SUPABASE_TEST_URL`), the CI report emits **"integration tests: blocked (test-isolation-unavailable)"**. It never fabricates green results and never writes to Live. Pure unit tests (Zod validators, state machine transitions in TypeScript, header-code allowlist checks) and read-only `supabase--linter` runs against Live remain enabled.

---

## 12. Closed-beta AI allowlist

New table `ai_allowlist (user_id uuid PK, granted_by uuid, granted_at timestamptz)`. `SELECT` restricted to `service_role`; the auth-middleware-backed server fns and `/api/generate-phase` call a `has_ai_access(user_id)` SECURITY DEFINER function that returns `true` iff the row exists.

Every AI-invoking path (`analyzeIdea`, `autowriteIdea`, `/api/generate-phase`) checks `has_ai_access(auth.uid())` first. Denied → `403` with allowlisted code `ai_access_denied`. UI shows a "Request access" call-to-action, no product content changes.

Removal condition (stated explicitly): the allowlist is removed only after the following are shipped, tested, and green — per-user daily model-call quotas enforced server-side, per-user daily spend cap enforced against actual Lovable AI Gateway ledger, and a workspace-level circuit-breaker that halts generation when daily spend exceeds a configured threshold. Until all three exist, the allowlist stays on.

Separately, the 10-active-project cap is enforced in `rpc_create_project` (`SELECT count(*) FROM projects WHERE owner_id=auth.uid() AND archived_at IS NULL`).

---

## 13. Test matrix

Unit tests (no DB):

- Zod payload schema — accept/reject boundary cases (sizes, counts, string lengths).
- Fallback-reason-code allowlist coverage.
- Decision state-machine transition table.

Integration tests (require isolated Test project — see §11):

1. Cross-user isolation — U1 cannot SELECT/UPDATE/DELETE any row belonging to U2 across every table.
2. Cross-project FK substitution — every composite FK from §4 rejected when project ids differ.
3. DNA immutability — direct UPDATE on `dna_versions` fails; `rpc_create_dna_version` succeeds.
4. Concurrent DNA creation — 5 parallel calls with distinct `request_key` produce contiguous version numbers with no gaps or duplicates; row lock verified.
5. Identical-request replay — same `request_key` returns the existing row, no new insert.
6. Payload-drift rejection — same `importId`, different `payload_hash`, returns `payload_drift`.
7. Partial migration retry — kill the RPC mid-batch, retry with same `importId`; final row counts match; no duplicate DNA versions/phase_runs/canvas_outputs.
8. Malformed / oversized migration payload — each Zod boundary produces the correct allowlisted `error_code`.
9. Decision transition bypass — direct UPDATE on `decisions` denied to authenticated; editing an `accepted` row rejected by trigger; superseded row cannot be re-edited.
10. Duplicate generation requests — two `/api/generate-phase` calls with the same `request_key` yield one `phase_runs` row.
11. Closed-beta AI denial — user without `ai_allowlist` row gets 403 from every AI path.
12. Test-environment fail-closed — harness aborts when Test/Live refs match or Test is unset.

Server-fn tests (Vitest via `bunx vitest run`):

- Every new server fn returns 401 without a bearer token.
- 10-project cap enforced (11th `createProject` rejected with `project_limit_reached`).
- `setCurrentDnaVersion` rejects a `dnaVersionId` belonging to another project.

Verification gates before shipping: `tsgo --noEmit` clean, `bun run build` green, ESLint zero errors on changed files, all suites green (or blocked with §11's message), `supabase--linter` clean.

---

## 14. Amended implementation slices (order changed)

Each slice ends in a verified state. Nothing starts before the previous is verified.

1. **Auth surface + AI allowlist gate.** Create `_authenticated/route.tsx` and `src/routes/auth.tsx`, rewrite `index.tsx` to a functional public sign-in entry (no marketing), enable Google via `supabase--configure_social_auth`, append `attachSupabaseAuth` to `src/start.ts` if no equivalent middleware exists. Ship 401 unit tests. Add `ai_allowlist` table + `has_ai_access` fn; gate all three AI paths. No other DB writes yet.
2. **Gate AI + collapse to one generation path.** Add auth middleware to existing AI server fns; delete `generatePhasePrompt` server fn; move `/api/generate-phase` to require bearer + `has_ai_access`. Idempotency plumbing added but persistence not required yet (writes stubbed until slice 4).
3. **Schema migration** (single `supabase--migration` call): all tables + composite uniques + composite FKs + CHECKs + RLS + policies + SECURITY DEFINER RPCs + phase_catalog seed. Ship integration tests 1-3 and 9.
4. **Cloud project CRUD + brief versioning.** `listProjects`, `createProject` (10-cap), `getProject`, `saveBrief`, rename/archive/delete. Move workspace UI to `_authenticated/app.tsx`, reading from cloud. Local storage still readable but no longer authoritative.
5. **DNA v2 + decisions + evidence.** `createDnaVersion` (atomic RPC), `setCurrentDnaVersion`, lifecycle RPCs, evidence CRUD. Wire UI. Ship tests 4-5 and 9.
6. **Phase runs + canvas outputs persistence.** `/api/generate-phase` calls `recordPhaseRun` with `request_key`. Canvas outputs move to cloud. Ship test 10.
7. **One-shot migration.** `migrateLocalProjects` server fn + `rpc_apply_import_batch` + client trigger + sentinel + manual "Import local projects" button. Ship tests 6-8.
8. **Final verification.** Full suite, linter, build, manual smoke via Playwright against the isolated Test project with a seeded allowlisted user.

---

Nothing above is implemented yet. If any slice needs a scope change mid-flight, I stop and re-plan rather than expand silently. Approve to begin Slice 1.
