import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  ProductDNAv2,
  ArchitectureModel,
  Checkpoint,
  ValidationReport,
  ValidationFinding,
  DecisionRegisterItem,
  RepoContext,
  InputKind,
} from "@/types";

const DAILY_LIMIT = 25;

class RateLimited extends Error {
  constructor() {
    super("ai_daily_limit_reached");
  }
}

async function consume(
  supabase: {
    rpc: (
      fn: "consume_ai_call",
      args: { _user_id: string; _limit: number },
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  },
  userId: string,
) {
  const { data, error } = await supabase.rpc("consume_ai_call", {
    _user_id: userId,
    _limit: DAILY_LIMIT,
  });
  if (error) throw new Error("rate_limit_check_failed");
  const row = Array.isArray(data) ? (data[0] as { allowed?: boolean }) : null;
  if (!row?.allowed) throw new RateLimited();
}

function gateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("missing_api_key");
  return createLovableAiGatewayProvider(key);
}

function parseJson<T>(raw: string): T {
  let cleaned = raw
    .replace(/^```json\s*/im, "")
    .replace(/^```\s*/im, "")
    .replace(/```\s*$/im, "")
    .trim();
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const s = Math.min(
      ...[cleaned.indexOf("{"), cleaned.indexOf("[")].filter((n) => n >= 0),
    );
    const e = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (Number.isFinite(s) && e > s) cleaned = cleaned.slice(s, e + 1);
  }
  return JSON.parse(cleaned) as T;
}

async function aiJson<T>(system: string, prompt: string, model = "google/gemini-3.5-flash"): Promise<T> {
  const g = gateway();
  try {
    const { text } = await generateText({
      model: g(model),
      system,
      prompt,
    });
    return parseJson<T>(text);
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err) && err.text) {
      return parseJson<T>(err.text);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Repo fetcher (public GitHub only)
// ---------------------------------------------------------------------------
const RepoInput = z.object({ url: z.string().url() });

export const fetchRepoContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RepoInput.parse(d))
  .handler(async ({ data }): Promise<RepoContext> => {
    const m = data.url.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
    if (!m) throw new Error("invalid_repo_url");
    const [, owner, rawRepo] = m;
    const repo = rawRepo.replace(/\.git$/, "");

    const headers = { Accept: "application/vnd.github+json", "User-Agent": "elite-canvas" };
    let readme: string | null = null;
    try {
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
        headers: { ...headers, Accept: "application/vnd.github.raw" },
      });
      if (r.ok) readme = (await r.text()).slice(0, 12000);
    } catch {
      /* ignore */
    }

    let topLevel: string[] = [];
    try {
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/`, { headers });
      if (r.ok) {
        const j = (await r.json()) as Array<{ name: string; type: string }>;
        topLevel = j.slice(0, 80).map((x) => `${x.type === "dir" ? "📁" : "📄"} ${x.name}`);
      }
    } catch {
      /* ignore */
    }

    return { url: data.url, owner, repo, readme, topLevel, fetchedAt: new Date().toISOString() };
  });

// ---------------------------------------------------------------------------
// DNA compiler
// ---------------------------------------------------------------------------
const DNA_SYSTEM = `You are the DNA Compiler for Elite Canvas — an AI Product Architecture Compiler.

Given an input (raw idea, existing project description, or repo context), produce a Product DNA.

CRITICAL RULES:
- Every field carries a status: "confirmed" | "proposed" | "assumed" | "unresolved".
- Use "confirmed" ONLY for facts explicitly stated by the user.
- Use "proposed" for reasonable AI recommendations awaiting review.
- Use "assumed" for details you filled in without evidence — be honest.
- Use "unresolved" for critical unknowns the user must decide.
- NEVER silently upgrade assumed to confirmed. Never invent facts about users, market, or scale.

Return STRICT JSON only, matching this TypeScript type:

{
  "projectName": string,
  "targetUsers": [{ "value": string, "status": "...", "rationale"?: string }],
  "problem": { "value": string, "status": "...", "rationale"?: string },
  "desiredOutcome": { "value": string, "status": "...", "rationale"?: string },
  "productBoundaries": [{ "value": string, "status": "..." }],
  "coreFeatures": [{ "value": string, "status": "..." }],
  "userRoles": [{ "value": { "role": string, "permissions": string[] }, "status": "..." }],
  "primaryJourneys": [{ "value": { "actor": string, "goal": string, "steps": string[] }, "status": "..." }],
  "nonGoals": [{ "value": string, "status": "..." }]
}

No prose, no markdown fences.`;

const CompileDnaInput = z.object({
  inputKind: z.enum(["idea", "description", "repo"]),
  content: z.string().min(1),
  repoContext: z.any().optional(),
});

export const compileDNA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompileDnaInput.parse(d))
  .handler(async ({ data, context }): Promise<ProductDNAv2> => {
    await consume(context.supabase, context.userId);
    let userPrompt = `Input kind: ${data.inputKind}\n\nContent:\n${data.content}`;
    if (data.repoContext) {
      const r = data.repoContext as RepoContext;
      userPrompt += `\n\nRepository: ${r.owner}/${r.repo}\nTop-level files:\n${r.topLevel.join("\n")}\n\nREADME excerpt:\n${r.readme ?? "(none)"}`;
    }
    return aiJson<ProductDNAv2>(DNA_SYSTEM, userPrompt, "openai/gpt-5.5");
  });

// ---------------------------------------------------------------------------
// Architecture compiler
// ---------------------------------------------------------------------------
const ARCH_SYSTEM = `You are the Systems Designer for Elite Canvas.

Given a Product DNA, produce an Architecture Model. Same status-tagging rules apply.

Return STRICT JSON matching:

{
  "screens": [{ "value": { "name": string, "purpose": string, "entryFrom": string[] }, "status": "..." }],
  "userStates": [{ "value": { "state": string, "transitions": [{ "to": string, "trigger": string }] }, "status": "..." }],
  "domainEntities": [{ "value": { "name": string, "fields": [{ "name": string, "type": string, "nullable"?: boolean, "note"?: string }], "relationships": string[] }, "status": "..." }],
  "ownership": [{ "value": { "entity": string, "owner": string, "rlsRule": string }, "status": "..." }],
  "integrations": [{ "value": { "name": string, "purpose": string, "auth": string, "dataFlow": string }, "status": "..." }],
  "aiResponsibilities": [{ "value": { "task": string, "model": string, "fallback": string }, "status": "..." }],
  "failureRecovery": [{ "value": { "scenario": string, "detection": string, "recovery": string }, "status": "..." }]
}

Use valid PostgreSQL types (text, uuid, timestamptz, jsonb, integer, boolean, numeric).
Every domain entity MUST have an ownership entry. No prose.`;

const CompileArchInput = z.object({ dna: z.any() });

export const compileArchitecture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompileArchInput.parse(d))
  .handler(async ({ data, context }): Promise<ArchitectureModel> => {
    await consume(context.supabase, context.userId);
    return aiJson<ArchitectureModel>(
      ARCH_SYSTEM,
      `Product DNA:\n${JSON.stringify(data.dna, null, 2)}`,
      "openai/gpt-5.5",
    );
  });

// ---------------------------------------------------------------------------
// Adaptive checkpoint planner
// ---------------------------------------------------------------------------
const CHECKPOINT_SYSTEM = `You are the Adaptive Build Planner for Elite Canvas.

Given a Project DNA, Architecture, decision register, and existing completed checkpoints, produce the SINGLE smallest next checkpoint that unlocks the most value while respecting:
- unresolved decisions (do NOT plan work that depends on them; flag as dependsOnDecisions)
- dependencies (auth before user-scoped data, schema before UI, integrations early if risky)
- risk (external / unknown work first)
- what is already done
- user priority hints if provided

A checkpoint is a Lovable handoff: small enough for one build session, deep enough to have acceptance tests.

Return STRICT JSON:

{
  "exactGoal": string,
  "whyThisNext": string,
  "allowedFiles": string[],
  "requirements": string[],
  "exclusions": string[],
  "acceptanceCriteria": string[],
  "verificationCommands": string[],
  "expectedReport": string,
  "dependsOnDecisions": string[]
}

Keep requirements between 3 and 10 items. No prose.`;

const PlanInput = z.object({
  dna: z.any(),
  architecture: z.any().nullable(),
  decisions: z.array(z.any()).default([]),
  completed: z.array(z.any()).default([]),
  priorityHint: z.string().optional(),
});

export const planNextCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PlanInput.parse(d))
  .handler(async ({ data, context }): Promise<Checkpoint> => {
    await consume(context.supabase, context.userId);
    const raw = await aiJson<Omit<Checkpoint, "id" | "createdAt" | "status">>(
      CHECKPOINT_SYSTEM,
      JSON.stringify(
        {
          dna: data.dna,
          architecture: data.architecture,
          unresolvedOrAssumedDecisions: (data.decisions as DecisionRegisterItem[]).filter(
            (d) => d.status === "unresolved" || d.status === "assumed",
          ),
          completedCheckpoints: (data.completed as Checkpoint[]).map((c) => ({
            goal: c.exactGoal,
            status: c.status,
          })),
          priorityHint: data.priorityHint ?? null,
        },
        null,
        2,
      ),
    );
    return {
      ...raw,
      id: `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      status: "ready",
    };
  });

// ---------------------------------------------------------------------------
// Architecture validator (heuristic — no AI call)
// ---------------------------------------------------------------------------
const VALID_SQL_TYPES = new Set([
  "text",
  "varchar",
  "uuid",
  "timestamptz",
  "timestamp",
  "date",
  "jsonb",
  "json",
  "integer",
  "int",
  "bigint",
  "smallint",
  "boolean",
  "bool",
  "numeric",
  "decimal",
  "real",
  "double precision",
  "bytea",
]);

const VENDOR_DENYLIST = [
  { pattern: /soc\s*2\s*(type\s*ii)?\s*certified/i, msg: "SOC2 certification cannot be claimed without audit evidence." },
  { pattern: /hipaa\s*compliant/i, msg: "HIPAA compliance cannot be claimed without a signed BAA and controls audit." },
  { pattern: /gdpr\s*certified/i, msg: "GDPR has no certification body — reword to 'GDPR-aligned' with specifics." },
  { pattern: /iso\s*27001\s*certified/i, msg: "ISO 27001 certification requires audit evidence." },
  { pattern: /100%\s*uptime/i, msg: "100% uptime is not achievable — quote a real SLA target." },
];

const ValidateInput = z.object({
  dna: z.any().nullable(),
  architecture: z.any().nullable(),
  checkpoint: z.any().nullable(),
  decisions: z.array(z.any()).default([]),
});

export const validateArchitecture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ValidateInput.parse(d))
  .handler(async ({ data }): Promise<ValidationReport> => {
    const findings: ValidationFinding[] = [];
    const arch = data.architecture as ArchitectureModel | null;
    const dna = data.dna as ProductDNAv2 | null;
    const cp = data.checkpoint as Checkpoint | null;
    const decisions = data.decisions as DecisionRegisterItem[];

    // Vendor / compliance claims across all text content
    const haystack = JSON.stringify({ dna, arch, cp }).toLowerCase();
    for (const rule of VENDOR_DENYLIST) {
      if (rule.pattern.test(haystack)) {
        findings.push({ severity: "warn", code: "vendor_claim_unsupported", message: rule.msg });
      }
    }

    if (arch) {
      const ownedEntities = new Set(arch.ownership.map((o) => o.value.entity.toLowerCase()));
      for (const e of arch.domainEntities) {
        const entity = e.value;
        const hasPk = entity.fields.some(
          (f) => /^id$/i.test(f.name) || /primary/i.test(f.note ?? ""),
        );
        if (!hasPk) {
          findings.push({
            severity: "error",
            code: "entity_missing_pk",
            message: `Entity "${entity.name}" has no primary key field.`,
            ref: entity.name,
          });
        }
        for (const f of entity.fields) {
          const base = f.type.toLowerCase().split("(")[0].trim();
          if (!VALID_SQL_TYPES.has(base)) {
            findings.push({
              severity: "error",
              code: "invalid_sql_type",
              message: `Entity "${entity.name}" field "${f.name}" uses invalid SQL type "${f.type}".`,
              ref: entity.name,
            });
          }
        }
        if (!ownedEntities.has(entity.name.toLowerCase())) {
          findings.push({
            severity: "error",
            code: "entity_missing_ownership",
            message: `Entity "${entity.name}" has no ownership / RLS rule defined.`,
            ref: entity.name,
          });
        }
      }
    }

    if (cp) {
      if (cp.requirements.length > 12) {
        findings.push({
          severity: "warn",
          code: "oversized_checkpoint",
          message: `Checkpoint has ${cp.requirements.length} requirements — consider splitting (max 12).`,
        });
      }
      for (const depId of cp.dependsOnDecisions ?? []) {
        const d = decisions.find((x) => x.id === depId);
        if (d && d.status === "unresolved") {
          findings.push({
            severity: "error",
            code: "unresolved_decision_blocks_checkpoint",
            message: `Checkpoint depends on unresolved decision: "${d.title}".`,
            ref: depId,
          });
        }
      }
    }

    if (!dna || !arch) {
      findings.push({
        severity: "info",
        code: "incomplete_output",
        message: "DNA and Architecture must both be compiled before shipping a checkpoint bundle.",
      });
    }

    return {
      ranAt: new Date().toISOString(),
      isDraft: findings.some((f) => f.severity === "error") || !dna || !arch,
      findings,
    };
  });

// ---------------------------------------------------------------------------
// Compiler-project persistence
// ---------------------------------------------------------------------------
const SaveInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  input_kind: z.enum(["idea", "description", "repo"]).default("idea"),
  idea: z.string().default(""),
  repo_url: z.string().nullable().optional(),
  repo_context: z.any().nullable().optional(),
  dna_v2: z.any().nullable().optional(),
  architecture: z.any().nullable().optional(),
  decisions: z.array(z.any()).default([]),
  checkpoints: z.array(z.any()).default([]),
  validation: z.any().nullable().optional(),
});

export interface CompilerProject {
  id: string;
  name: string;
  inputKind: InputKind;
  idea: string;
  repoUrl: string | null;
  repoContext: RepoContext | null;
  dnaV2: ProductDNAv2 | null;
  architecture: ArchitectureModel | null;
  decisions: DecisionRegisterItem[];
  checkpoints: Checkpoint[];
  validation: ValidationReport | null;
  createdAt: string;
  updatedAt: string;
}

type ProjRow = {
  id: string;
  name: string;
  input_kind: string;
  idea: string;
  repo_url: string | null;
  repo_context: unknown;
  dna_v2: unknown;
  architecture: unknown;
  decisions: unknown;
  checkpoints: unknown;
  validation: unknown;
  created_at: string;
  updated_at: string;
};

function fromRow(r: ProjRow): CompilerProject {
  return {
    id: r.id,
    name: r.name,
    inputKind: (r.input_kind as InputKind) ?? "idea",
    idea: r.idea ?? "",
    repoUrl: r.repo_url,
    repoContext: (r.repo_context ?? null) as RepoContext | null,
    dnaV2: (r.dna_v2 ?? null) as ProductDNAv2 | null,
    architecture: (r.architecture ?? null) as ArchitectureModel | null,
    decisions: (r.decisions ?? []) as DecisionRegisterItem[],
    checkpoints: (r.checkpoints ?? []) as Checkpoint[],
    validation: (r.validation ?? null) as ValidationReport | null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const COLS =
  "id, name, input_kind, idea, repo_url, repo_context, dna_v2, architecture, decisions, checkpoints, validation, created_at, updated_at";

export const listCompilerProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompilerProject[]> => {
    const { data, error } = await context.supabase
      .from("projects")
      .select(COLS)
      .eq("archived", false)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as ProjRow[]).map(fromRow);
  });

export const saveCompilerProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }): Promise<CompilerProject> => {
    const row = {
      owner_id: context.userId,
      name: data.name,
      input_kind: data.input_kind,
      idea: data.idea,
      repo_url: data.repo_url ?? null,
      repo_context: data.repo_context ?? null,
      dna_v2: data.dna_v2 ?? null,
      architecture: data.architecture ?? null,
      decisions: data.decisions,
      checkpoints: data.checkpoints,
      validation: data.validation ?? null,
    };
    if (data.id) {
      const { data: u, error } = await context.supabase
        .from("projects")
        .update(row)
        .eq("id", data.id)
        .eq("owner_id", context.userId)
        .select(COLS)
        .single();
      if (error) throw new Error(error.message);
      return fromRow(u as ProjRow);
    }
    const { data: i, error } = await context.supabase
      .from("projects")
      .insert(row)
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);
    return fromRow(i as ProjRow);
  });

export const deleteCompilerProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
