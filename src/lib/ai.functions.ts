import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { resolveModel } from "./models";
import type { BuildPhase, ProjectDNA } from "@/types";

const ARCHITECT_SYSTEM_PROMPT = `You are Elite for Lovable, a senior product strategist, SaaS architect, UX director, database designer, and production-readiness auditor.
Your job is to analyze the user's raw product idea and convert it into a structured, evidence-aware "Project DNA".

The Project DNA must include:
1. A concise, professional project name.
2. An architecture readiness score (0-100%).
3. A strategic product summary.
4. An array of 3-5 critical architectural decisions/questions that must be resolved, each with a recommended defense default.
5. A highly detailed technical breakdown covering:
   - Target User Roles & Permissions
   - Primary Pages, Views & Core Navigation
   - Data Schema Recommendations (Tables, Fields, Relationships, Row-Level Security Rules)
   - External Integrations (APIs, Webhooks, Payments, etc. if applicable)
   - Motion & Visual Styling Directions (refining the visual vibe, spacing, fonts)

Return your response in structured JSON matching the requested schema. Ensure all fields are richly populated. Do not use generic placeholders.`;

const PROMPT_GENERATOR_SYSTEM_PROMPT = `You are Elite for Lovable, a master prompt engineer specializing in generating highly execution-focused prompts for Lovable.dev.
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

const AnalyzeInput = z.object({
  idea: z.string().min(1),
  productType: z.string().optional(),
  stage: z.string().optional(),
  constraints: z.string().optional(),
  references: z.string().optional(),
  model: z.string().optional(),
});

const dnaSchema = z.object({
  projectName: z.string(),
  readiness: z.number(),
  summary: z.string(),
  criticalDecisions: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      recommendation: z.string(),
    }),
  ),
  architecture: z.string(),
  features: z.array(z.string()),
  userRoles: z.array(
    z.object({
      role: z.string(),
      permissions: z.array(z.string()),
    }),
  ),
});

export const analyzeIdea = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AnalyzeInput.parse(data))
  .handler(async ({ data }): Promise<ProjectDNA> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key, { structuredOutputs: true });
    const model = gateway(resolveModel(data.model, "analyze"));

    const userPrompt = `
Product Idea: ${data.idea}
Application Type: ${data.productType || "Automatically determine"}
Project State/Stage: ${data.stage || "New application"}
Constraints/Requirements: ${data.constraints || "None provided"}
References/Visual Style: ${data.references || "None provided"}

Respond with valid JSON matching the required schema. Ensure "readiness" is an integer between 10 and 100.
    `.trim();

    try {
      const { output } = await generateText({
        model,
        system: ARCHITECT_SYSTEM_PROMPT,
        prompt: userPrompt,
        output: Output.object({ schema: dnaSchema }),
      });
      return output as ProjectDNA;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const raw = error.text ?? "";
        try {
          let cleaned = raw
            .replace(/^```json\s*/im, "")
            .replace(/^```\s*/im, "")
            .replace(/```\s*$/im, "")
            .trim();
          if (!cleaned.startsWith("{")) {
            const start = cleaned.indexOf("{");
            const end = cleaned.lastIndexOf("}");
            if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
          }
          const parsed = JSON.parse(cleaned);
          return dnaSchema.parse(parsed) as ProjectDNA;
        } catch (parseErr) {
          console.error("analyzeIdea parse fallback failed", { parseErr, raw: raw.slice(0, 500) });
          throw new Error("The AI returned an invalid response. Please try again.");
        }
      }
      throw error;
    }
  });

const GeneratePromptInput = z.object({
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

export const generatePhasePrompt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => GeneratePromptInput.parse(data))
  .handler(async ({ data }): Promise<{ prompt: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway(resolveModel((data as { model?: string }).model, "phase"));

    const { dna, phase, depth, stack, motionIntensity } = data as {
      dna: ProjectDNA;
      phase: BuildPhase;
      depth?: string;
      stack?: string;
      motionIntensity?: string;
    };

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

    const { text } = await generateText({
      model,
      system: PROMPT_GENERATOR_SYSTEM_PROMPT,
      prompt: userPrompt,
    });

    return { prompt: text };
  });

const AutowriteInput = z.object({
  idea: z.string().min(1),
  productType: z.string().optional(),
  stage: z.string().optional(),
  model: z.string().optional(),
});

const AUTOWRITER_SYSTEM_PROMPT = `You are Elite for Lovable, a senior product strategist and copywriter.
Rewrite the user's raw product vision into a single dense, production-grade paragraph (roughly 90-160 words).

Rules:
- Preserve the user's intent, domain, and any specific names/details they mentioned. Never invent a different product.
- Sharpen the target user, core value, primary jobs-to-be-done, and 3-6 key capabilities.
- Include hints about monetization or business model only if plausible from the input.
- Confident, concrete, no filler, no marketing fluff, no bullet points, no headings.
- Output ONLY the rewritten vision paragraph as plain text. No preamble, no quotes, no markdown.`;

export const autowriteIdea = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AutowriteInput.parse(data))
  .handler(async ({ data }): Promise<{ idea: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway(resolveModel(data.model, "autowrite"));

    const userPrompt = `Raw product vision:
"""
${data.idea}
"""

Application type: ${data.productType || "Automatically determine"}
Project stage: ${data.stage || "New application"}

Rewrite this into one dense, elite product vision paragraph.`;

    const { text } = await generateText({
      model,
      system: AUTOWRITER_SYSTEM_PROMPT,
      prompt: userPrompt,
    });

    return { idea: text.trim() };
  });
