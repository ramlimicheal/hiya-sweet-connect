import type { BuildPhase, ProjectDNA } from "@/types";

type PromptFallbackOptions = {
  dna: ProjectDNA;
  phase: Pick<BuildPhase, "number" | "title" | "description" | "requirements">;
  depth?: string;
  stack?: string;
  motionIntensity?: string;
};

function list(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- Define this clearly from the Project DNA before implementation.";
}

function roles(dna: ProjectDNA) {
  if (!dna.userRoles.length) return "- User: Can access the core product experience.";
  return dna.userRoles
    .map((role) => `- ${role.role}: ${role.permissions.join(", ") || "standard product access"}`)
    .join("\n");
}

function decisions(dna: ProjectDNA) {
  if (!dna.criticalDecisions.length) return "- No unresolved critical decisions were provided.";
  return dna.criticalDecisions
    .map(
      (decision, index) =>
        `${index + 1}. **${decision.title}** — ${decision.description}\n   - Default: ${decision.recommendation}`,
    )
    .join("\n");
}

export function buildFallbackPhasePrompt({ dna, phase, depth, stack, motionIntensity }: PromptFallbackOptions) {
  const selectedStack = stack || "Lovable defaults with React, TypeScript, Tailwind, and Lovable Cloud where backend persistence is required";
  const selectedDepth = depth || "deep";
  const selectedMotion = motionIntensity || "refined";

  return `# Phase ${phase.number} — ${phase.title}

## Phase Context
Build this phase for **${dna.projectName}** while preserving all existing code, UI state, data, routes, and completed phases. This phase exists to deliver: ${phase.description}

**Project summary:** ${dna.summary}

**Architecture readiness:** ${dna.readiness}%

**Preferred stack:** ${selectedStack}

**Prompt depth:** ${selectedDepth}

**Motion direction:** ${selectedMotion}

## Functional Requirements
Implement the following as production behavior, not static mock UI:

${phase.requirements}

Core product capabilities that must remain aligned with this phase:

${list(dna.features)}

## User Roles & Permissions
Respect these roles throughout the implementation:

${roles(dna)}

If authentication, database access, admin capabilities, private records, payments, uploads, or personal data are involved, enforce permissions server-side and never rely on client-only checks.

## Technical Architecture
Use the existing project structure and design system. Refactor only where it directly supports this phase. Do not break already completed functionality.

Project architecture reference:

${dna.architecture}

Implementation expectations:

- Create or update reusable components for this phase instead of duplicating logic.
- Connect every visible control to real state, handlers, validation, and loading/error/success states.
- Keep secrets and privileged operations server-side.
- If persistent data is needed, define database tables, grants, Row-Level Security policies, and ownership rules before wiring UI.
- Add typed validation for user input and API/server-function boundaries.
- Preserve responsive behavior across mobile, tablet, and desktop.

## Critical Decisions To Honor
${decisions(dna)}

## Visual Design & Polish
Design the phase as a cohesive part of **${dna.projectName}**. Use the existing visual language unless this phase explicitly requires a new pattern.

- Keep hierarchy clear: primary actions, secondary actions, status indicators, and destructive actions must be visually distinct.
- Use stable dimensions for controls, cards, tables, grids, and generated content areas so loading and dynamic text do not shift the layout.
- Include focused, hover, disabled, empty, loading, error, and success states.
- Motion should be ${selectedMotion}: meaningful, fast, and respectful of reduced-motion preferences.
- Avoid placeholder copy. Use product-specific labels, empty states, and feedback messages.

## Edge Cases & Failure Handling
Handle these cases explicitly:

- Missing, partial, or invalid user input.
- Slow network/server responses with non-blocking loading UI.
- Empty datasets and first-run experiences.
- Permission-denied, unauthenticated, and expired-session states where relevant.
- Duplicate submissions, rapid repeated clicks, and interrupted flows.
- Mobile overflow, long text, narrow screens, and keyboard/focus navigation.

## Exact Verification Checklist
Before finishing, verify:

- The app builds without TypeScript, route, or import errors.
- This phase works from a clean browser session and with existing saved project data.
- Every new button, input, menu, tab, upload, or action performs a real function.
- Error, empty, loading, and success states are visible and polished.
- Layout is responsive and no text overlaps or escapes its container.
- Existing completed phases and saved project memory still work.
- Any backend data access uses secure ownership and role rules.
- The final screen is useful immediately without mock-only content.`;
}