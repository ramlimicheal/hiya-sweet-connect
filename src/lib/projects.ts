import type { ProjectDNA, BuildPhase } from "@/types";
import { DEFAULT_PHASES } from "@/data/phases";

export interface CanvasOutput {
  title: string;
  content: string;
  timestamp: string;
}

export interface ProjectSnapshot {
  id: string;
  cloudId?: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  idea: string;
  productType: string;
  stage: string;
  constraints: string;
  references: string;
  dna: ProjectDNA | null;
  phases: BuildPhase[];
  canvasOutputs: CanvasOutput[];
}

export interface ProjectsStore {
  activeId: string | null;
  projects: ProjectSnapshot[];
}

const KEY = "elite_canvas_projects_v1";
// Legacy single-project keys (v0)
const LEGACY = {
  dna: "elite_canvas_dna",
  phases: "elite_canvas_phases",
  outputs: "elite_canvas_outputs",
};

export function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeEmptyProject(name = "Untitled Project"): ProjectSnapshot {
  const now = Date.now();
  return {
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    idea: "",
    productType: "Automatically determine",
    stage: "New application",
    constraints: "",
    references: "",
    dna: null,
    phases: DEFAULT_PHASES.map((p) => ({ ...p, generatedPrompt: undefined, status: "idle" as const })),
    canvasOutputs: [],
  };
}

export function deriveProjectName(p: Pick<ProjectSnapshot, "dna" | "idea">): string {
  if (p.dna?.projectName) return p.dna.projectName;
  const idea = (p.idea || "").trim();
  if (idea) return idea.slice(0, 40) + (idea.length > 40 ? "…" : "");
  return "Untitled Project";
}

export function loadStore(): ProjectsStore {
  if (typeof window === "undefined") return { activeId: null, projects: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectsStore;
      if (Array.isArray(parsed.projects)) return parsed;
    }
  } catch (e) {
    console.error("projects: parse failed", e);
  }
  // Migrate legacy single-project keys, if any.
  try {
    const legacyDna = localStorage.getItem(LEGACY.dna);
    const legacyPhases = localStorage.getItem(LEGACY.phases);
    const legacyOutputs = localStorage.getItem(LEGACY.outputs);
    if (legacyDna || legacyPhases || legacyOutputs) {
      const proj = makeEmptyProject();
      if (legacyDna) proj.dna = JSON.parse(legacyDna);
      if (legacyPhases) proj.phases = JSON.parse(legacyPhases);
      if (legacyOutputs) proj.canvasOutputs = JSON.parse(legacyOutputs);
      proj.name = deriveProjectName(proj);
      const store: ProjectsStore = { activeId: proj.id, projects: [proj] };
      saveStore(store);
      // Keep legacy keys for a bit in case user rolls back; they're harmless.
      return store;
    }
  } catch (e) {
    console.error("projects: legacy migration failed", e);
  }
  return { activeId: null, projects: [] };
}

export function saveStore(store: ProjectsStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch (e) {
    console.error("projects: save failed", e);
  }
}
