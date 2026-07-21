# Deep Architect Mode — Execution Plan

Scope confirmed: full overhaul. Auth = Google only. Rate limit = 100 AI calls / user / UTC day.

Delivered across 4 sequential slices. Each slice ends buildable + smoke-tested. No enterprise audit gates — ship first, harden later.

---

## Slice A — MVP Unlock + Daily Rate Limit (foundation)

**Goal:** Any signed-in user can use Canvas. Cheap abuse guard in place.

- Remove `has_ai_access` checks from `analyzeIdea`, `autowriteIdea`, `/api/generate-phase`. Keep `ai_allowlist` table (deprecated, unused).
- New table `ai_usage_daily(user_id, usage_date, calls)` with unique `(user_id, usage_date)`.
- RPC `consume_ai_call(_user_id uuid, _limit int)` — SECURITY DEFINER, atomic UPSERT + increment, returns `{allowed, used, remaining}`. Called before every AI action.
- Server surfaces `429` with `X-Elite-Canvas-Error: rate_limited` when exceeded.
- Sign-in via Google only (email/password disabled). Verified-email gate on all AI endpoints.
- Sidebar shows "X / 100 calls today".

## Slice B — Cloud Projects (persistence)

**Goal:** Projects live in the cloud, per user, survive device switches.

New tables (all RLS `auth.uid() = owner_id`):
- `projects(id, owner_id, name, idea, product_type, stage, constraints, references, archived_at, created_at, updated_at)`
- `dna_versions(id, project_id, owner_id, version_no, dna jsonb, created_at)` — append-only via trigger.
- `phase_prompts(id, project_id, owner_id, phase_id, prompt, source, model, dna_version_id, created_at)` — latest-wins per `(project_id, phase_id)`.
- `canvas_outputs(id, project_id, owner_id, title, content, created_at)`.

Server fns: `listProjects`, `createProject`, `renameProject`, `archiveProject`, `deleteProject`, `getProject` (returns project + latest dna + phases + outputs).

One-time localStorage → cloud migration on first sign-in (idempotent by client-generated legacy id stored in cloud row).

## Slice C — DNA v2: Editable + Versioned + Decisions Ledger

**Goal:** DNA is a living document, not a one-shot generation.

- **Editable DNA:** every DNA field editable inline in the DNA view. Save creates a new `dna_versions` row (append-only).
- **Version history panel:** list versions with diff-style summary (fields changed), one-click revert (creates new version copying old content).
- **Decisions ledger:** `decisions(id, project_id, owner_id, dna_version_id, title, context, options jsonb, chosen text, status, superseded_by, created_at)`. Lifecycle: `proposed → accepted | rejected | superseded`.
- **Evidence:** `evidence(id, project_id, owner_id, decision_id nullable, kind, title, url, note, created_at)` — attach links/notes to decisions or the project.
- New "Decisions" and "Evidence" tabs alongside DNA/Phases/Output/Canvas.

## Slice D — Reasoning Streaming + Context-Aware Phase Regen

**Goal:** The prompts feel intelligent, not templated.

- **Streaming DNA analysis** using AI SDK `streamText` piped through a server route (`/api/analyze-stream`) so the UI shows the reasoning trace live.
- **Context-aware phase regeneration:** every `/api/generate-phase` call now includes:
  - current DNA (latest version)
  - accepted decisions
  - user-attached evidence
  - previously generated phases (short summaries) so later phases build on earlier ones
- **Regenerate with hint:** each phase card gets a "Regenerate with feedback…" action that adds a user instruction into the next prompt.
- Auto model routing stays; Gemini 3.5 Flash for cheap/streaming, GPT-5.5 for phase generation when credits allow.

---

## Technical details

- **Auth:** `supabase--configure_social_auth { providers: ["google"], disable_providers: ["email"] }`. Managed Cloud OAuth. `/auth` page becomes Google-only. `_authenticated` layout gate stays.
- **Rate limit RPC:** atomic `INSERT … ON CONFLICT (user_id, usage_date) DO UPDATE SET calls = calls + 1 RETURNING calls`; compare to `_limit`, roll back with sub-select if exceeded (or check-before-increment via CTE).
- **DNA append-only:** `BEFORE UPDATE` trigger on `dna_versions` raises exception. New version = new row; `projects.current_dna_version_id` points at latest.
- **Bearer flow:** `requireSupabaseAuth` middleware already wired in `src/start.ts` — reused for all new server fns. `/api/generate-phase` and `/api/analyze-stream` keep manual bearer verification (they need raw `Response`).
- **Migration strategy:** localStorage projects imported on first cloud login via `importLocalProjects` server fn that accepts array + `client_import_id`, upserts on `(owner_id, client_import_id)` to be idempotent. LocalStorage kept until user hits "Clear local backup".
- **UI:** Sidebar becomes cloud-backed project list. Existing 6-tab layout preserved; adds Decisions + Evidence tabs. Streaming DNA replaces current one-shot generate.

---

## Deferred (explicitly out of scope)

- Multi-workspace, sharing/permissions, export bundle, project chat, SEO/marketing pages, payments, custom domains, visual redesign, evidence file uploads (URLs only for now).

---

## Execution order

I'll ship Slice A end-to-end first (unlock + rate limit + Google-only), verify it builds and a signed-in user can generate, then move to B, C, D in sequence. You'll see each slice land as its own set of changes — no huge single drop.

**Ready to start Slice A?** Reply "go" and I'll execute.