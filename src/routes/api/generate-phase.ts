import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { resolveModel } from "@/lib/models";
import { buildFallbackPhasePrompt } from "@/lib/prompt-fallback";
import type { Database } from "@/integrations/supabase/types";

const SYSTEM_PROMPT = `You are Elite for Lovable, a master prompt engineer specializing in generating highly execution-focused prompts for Lovable.dev.
Your job is to take a structured Project DNA and generate a single, highly detailed, masterfully crafted Lovable prompt for a specific build phase.

Every prompt you generate must adhere to the Lovable Contract:
- Preserving existing codebase/progress when editing.
- Creating fully functional interactive behaviors, not static mockups.
- Connecting every visible control to actual state/functions.
- Keeping API keys and backend secrets secure server-side.
- Ensuring flawless responsive design, high contrast, accessibility (ARIA, focus-states).
- Designing loading, error, empty, and success states.

Your output must be structured, professional, and contain:
1. Phase Context (What we are building in this phase, and why).
2. Functional Requirements (exactly what features/interactions to write).
3. Technical Architecture (components, database schemas, API routes, security guards).
4. Visual Design & Polish (spacing, typography, color tokens, and exact motion transitions).
5. Edge-Case Scenarios & Failures (handling slow connections, error notifications).
6. Exact Verification checklist for Lovable.

Do not use conversational filler before or after the prompt. Return ONLY the markdown-formatted prompt itself.`;

type FallbackReasonCode =
  | "missing_api_key"
  | "empty_model_response"
  | "gateway_timeout"
  | "rate_limited"
  | "invalid_model_output"
  | "generation_failed";

function classifyGenerationError(error: unknown): FallbackReasonCode {
  const name = error instanceof Error ? error.name.toLowerCase() : "";
  const raw = error instanceof Error ? error.message.toLowerCase() : "";
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;

  if (status === 429 || raw.includes("rate limit") || raw.includes("too many requests")) {
    return "rate_limited";
  }
  if (
    name.includes("timeout") ||
    name.includes("abort") ||
    raw.includes("timeout") ||
    raw.includes("timed out") ||
    status === 504
  ) {
    return "gateway_timeout";
  }
  if (
    name.includes("noobjectgenerated") ||
    name.includes("invalidresponse") ||
    raw.includes("could not parse") ||
    raw.includes("invalid json") ||
    raw.includes("schema")
  ) {
    return "invalid_model_output";
  }
  return "generation_failed";
}

const InputSchema = z.object({
  dna: z.object({
    projectName: z.string(),
    readiness: z.number(),
    summary: z.string(),
    architecture: z.string(),
    features: z.array(z.string()),
    userRoles: z.array(z.object({ role: z.string(), permissions: z.array(z.string()) })),
    criticalDecisions: z.array(
      z.object({ title: z.string(), description: z.string(), recommendation: z.string() }),
    ),
  }),
  phase: z.object({
    id: z.string(),
    number: z.string(),
    title: z.string(),
    description: z.string(),
    requirements: z.string(),
  }),
  depth: z.string().optional(),
  stack: z.string().optional(),
  motionIntensity: z.string().optional(),
  model: z.string().optional(),
  decisions: z
    .array(
      z.object({
        title: z.string(),
        chosen: z.string().optional(),
        rationale: z.string().optional(),
        evidence: z
          .array(
            z.object({
              kind: z.enum(["url", "note"]),
              title: z.string(),
              url: z.string().optional(),
              note: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export const Route = createFileRoute("/api/generate-phase")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // --- Bearer auth gate ------------------------------------------------
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token || token.split(".").length !== 3) {
          return new Response("Unauthorized", { status: 401 });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabasePubKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !supabasePubKey) {
          return new Response("Server misconfigured", { status: 500 });
        }

        const supabase = createClient<Database>(supabaseUrl, supabasePubKey, {
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (
                supabasePubKey.startsWith("sb_") &&
                h.get("Authorization") === `Bearer ${supabasePubKey}`
              ) {
                h.delete("Authorization");
              }
              h.set("apikey", supabasePubKey);
              h.set("Authorization", `Bearer ${token}`);
              return fetch(input, { ...init, headers: h });
            },
          },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        let userId: string;
        try {
          const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
          if (claimsErr || !claims?.claims?.sub) {
            return new Response("Unauthorized", { status: 401 });
          }
          userId = claims.claims.sub;
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }

        // --- Daily AI usage limit (100 calls/user/UTC day) ------------------
        const { data: usageRows, error: usageErr } = await supabase.rpc("consume_ai_call", {
          _user_id: userId,
          _limit: 100,
        });
        if (usageErr) {
          console.error("consume_ai_call failed", usageErr);
          return new Response("rate_limit_check_failed", { status: 500 });
        }
        const usage = Array.isArray(usageRows) ? usageRows[0] : null;
        if (!usage?.allowed) {
          return new Response("rate_limited", {
            status: 429,
            headers: {
              "X-Elite-Canvas-Error": "rate_limited",
              "X-Elite-Canvas-Usage-Used": String(usage?.used ?? 100),
              "X-Elite-Canvas-Usage-Limit": String(usage?.day_limit ?? 100),
            },
          });
        }

        const key = process.env.LOVABLE_API_KEY;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        const parsed = InputSchema.safeParse(body);
        if (!parsed.success) {
          return new Response("Invalid input", { status: 400 });
        }
        const { dna, phase, depth, stack, motionIntensity, model: modelId, decisions } = parsed.data;

        const fallbackPrompt = () =>
          buildFallbackPhasePrompt({ dna, phase, depth, stack, motionIntensity });

        if (!key) {
          return new Response(fallbackPrompt(), {
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              "X-Elite-Canvas-Source": "fallback",
              "X-Elite-Canvas-Fallback-Reason": "missing_api_key",
            },
          });
        }

        const resolvedModel = resolveModel(modelId, "phase");
        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway(resolvedModel);

        const userPrompt = `
Project Name: ${dna.projectName}
Project Summary: ${dna.summary}

Preferred Tech Stack: ${stack || "Lovable defaults with React, TypeScript, Tailwind and Supabase"}
Prompt Detail Depth: ${depth || "deep"}
Motion Intensity: ${motionIntensity || "refined"}

User Roles:
${JSON.stringify(dna.userRoles, null, 2)}

Technical Architecture Details:
${dna.architecture}
${
  decisions && decisions.length > 0
    ? `\nAccepted Architectural Decisions (Memory Ledger — respect these, do not contradict):\n${decisions
        .map((d, i) => {
          const evLines = (d.evidence ?? [])
            .map((e) =>
              e.kind === "url"
                ? `     - [${e.title}](${e.url ?? ""})`
                : `     - Note — ${e.title}${e.note ? `: ${e.note}` : ""}`,
            )
            .join("\n");
          return `${i + 1}. ${d.title}${d.chosen ? ` — Chosen: ${d.chosen}` : ""}${
            d.rationale ? ` — Rationale: ${d.rationale}` : ""
          }${evLines ? `\n   Evidence:\n${evLines}` : ""}`;
        })
        .join("\n")}\n`
    : ""
}
We are now generating the Lovable Prompt for Phase:
Number: ${phase.number}
Title: ${phase.title}
Description: ${phase.description}
Phase Core Requirements: ${phase.requirements}

Ensure the output is written in the perspective of a Senior Prompt Engineer, instructing Lovable to build or edit this phase perfectly. Output must be pure Markdown ready to copy-paste.
        `.trim();

        try {
          const { text } = await generateText({
            model,
            system: SYSTEM_PROMPT,
            prompt: userPrompt,
          });

          const trimmed = text.trim();
          if (!trimmed) {
            return new Response(fallbackPrompt(), {
              headers: {
                "Content-Type": "text/markdown; charset=utf-8",
                "X-Elite-Canvas-Source": "fallback",
                "X-Elite-Canvas-Fallback-Reason": "empty_model_response",
              },
            });
          }
          return new Response(trimmed, {
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              "X-Elite-Canvas-Source": "ai",
              "X-Elite-Canvas-Model": resolvedModel,
            },
          });
        } catch (error) {
          const code = classifyGenerationError(error);
          console.warn("generate-phase AI fallback used", {
            code,
            message: error instanceof Error ? error.message : String(error),
          });
          return new Response(fallbackPrompt(), {
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              "X-Elite-Canvas-Source": "fallback",
              "X-Elite-Canvas-Fallback-Reason": code,
            },
          });
        }
      },
    },
  },
});
