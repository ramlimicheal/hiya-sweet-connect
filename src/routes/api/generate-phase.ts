import { createFileRoute } from "@tanstack/react-router";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { resolveModel } from "@/lib/models";
import { buildFallbackPhasePrompt } from "@/lib/prompt-fallback";

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
});

export const Route = createFileRoute("/api/generate-phase")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        const { dna, phase, depth, stack, motionIntensity, model: modelId } = parsed.data;

        const fallbackPrompt = () => buildFallbackPhasePrompt({ dna, phase, depth, stack, motionIntensity });

        if (!key) {
          return new Response(fallbackPrompt(), {
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              "X-Elite-Canvas-Source": "fallback",
              "X-Elite-Canvas-Fallback-Reason": "missing-api-key",
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
                "X-Elite-Canvas-Fallback-Reason": "empty-ai-response",
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
          const reason = error instanceof Error ? error.message : String(error);
          console.warn("generate-phase AI fallback used", reason);
          return new Response(fallbackPrompt(), {
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              "X-Elite-Canvas-Source": "fallback",
              "X-Elite-Canvas-Fallback-Reason": reason.slice(0, 200),
            },
          });
        }

      },
    },
  },
});
