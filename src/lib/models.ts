export type ModelId =
  | "openai/gpt-5.5"
  | "openai/gpt-5.6-sol"
  | "openai/gpt-5.6-terra"
  | "openai/gpt-5.4"
  | "google/gemini-3.1-pro-preview"
  | "google/gemini-3.5-flash";

export type ModelSelection = "auto" | ModelId;
export type AiTask = "analyze" | "phase" | "autowrite";

export const AVAILABLE_MODELS: Array<{
  id: ModelId;
  label: string;
  tag: string;
  hint: string;
}> = [
  { id: "openai/gpt-5.6-sol", label: "GPT-5.6 Sol", tag: "Frontier", hint: "OpenAI's hardest-reasoning flagship. Slower, most rigorous." },
  { id: "openai/gpt-5.5", label: "GPT-5.5", tag: "Flagship", hint: "Best all-round quality for complex architecture reasoning." },
  { id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra", tag: "Balanced", hint: "GPT-5.5-level quality at lower cost." },
  { id: "openai/gpt-5.4", label: "GPT-5.4", tag: "Value", hint: "Affordable frontier model for coding and analysis." },
  { id: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", tag: "Cheapest Pro", hint: "~3× cheaper than GPT-5.5. Strong general reasoning." },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", tag: "Fastest", hint: "Lowest latency and cost for quick iterations." },
];

// Task-tuned auto routing: cheapest models that still do the job well.
// Gemini Flash on the Lovable AI Gateway is currently free / near-free, so
// auto mode defaults to it for every task to avoid burning credits.
const AUTO_ROUTES: Record<AiTask, ModelId> = {
  analyze: "google/gemini-3.5-flash",   // free-tier friendly, solid JSON reasoning
  phase: "google/gemini-3.5-flash",     // long prompt writing at ~0 credit cost
  autowrite: "google/gemini-3.5-flash", // fast lightweight rewrite
};

export const DEFAULT_SELECTION: ModelSelection = "auto";
export const DEFAULT_MODEL: ModelId = "openai/gpt-5.5";

export function isValidModel(id: string | undefined | null): id is ModelId {
  return !!id && AVAILABLE_MODELS.some((m) => m.id === id);
}

export function isValidSelection(id: string | undefined | null): id is ModelSelection {
  return id === "auto" || isValidModel(id);
}

/** Resolve a user selection into a concrete model id for a given task. */
export function resolveModel(selection: string | undefined | null, task: AiTask): ModelId {
  if (isValidModel(selection)) return selection;
  return AUTO_ROUTES[task];
}

export function autoModelFor(task: AiTask): ModelId {
  return AUTO_ROUTES[task];
}
