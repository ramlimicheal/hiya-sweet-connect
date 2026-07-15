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
}

export type ViewType = "idea" | "dna" | "phases" | "output" | "canvas" | "settings";
