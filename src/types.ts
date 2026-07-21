export interface CriticalDecision {
  title: string;
  description: string;
  recommendation: string;
}

export interface UserRole {
  role: string;
  permissions: string[];
}

export interface ProjectDNA {
  projectName: string;
  readiness: number;
  summary: string;
  criticalDecisions: CriticalDecision[];
  architecture: string;
  features: string[];
  userRoles: UserRole[];
}

export interface BuildPhase {
  id: string;
  number: string;
  title: string;
  description: string;
  requirements: string;
  generatedPrompt?: string;
  status: "idle" | "generating" | "completed" | "error";
  source?: "ai" | "fallback";
  model?: string;
}

export interface Evidence {
  id: string;
  kind: "url" | "note";
  title: string;
  url?: string;
  note?: string;
  createdAt: number;
}

export interface Decision {
  id: string;
  title: string;
  context: string;
  options: string;
  chosen: string;
  rationale: string;
  status: "proposed" | "accepted" | "rejected" | "superseded";
  supersedes?: string;
  evidence?: Evidence[];
  createdAt: number;
  updatedAt: number;
}

export interface DnaSnapshot {
  id: string;
  version: number;
  dna: ProjectDNA;
  note: string;
  createdAt: number;
}

export type ViewType = "idea" | "dna" | "phases" | "output" | "canvas" | "memory" | "settings";
