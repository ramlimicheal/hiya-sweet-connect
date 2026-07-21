// ============================================================================
// Legacy types (kept for backward compat with existing app.tsx)
// ============================================================================
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

export type ViewType = "idea" | "dna" | "phases" | "output" | "canvas" | "settings";

// ============================================================================
// Architecture Compiler v2 types
// ============================================================================
export type DecisionStatus = "confirmed" | "proposed" | "assumed" | "unresolved";

export interface Tagged<T> {
  value: T;
  status: DecisionStatus;
  rationale?: string;
}

export interface UserJourney {
  actor: string;
  goal: string;
  steps: string[];
}

export interface ProductDNAv2 {
  projectName: string;
  targetUsers: Array<Tagged<string>>;
  problem: Tagged<string>;
  desiredOutcome: Tagged<string>;
  productBoundaries: Array<Tagged<string>>;
  coreFeatures: Array<Tagged<string>>;
  userRoles: Array<Tagged<{ role: string; permissions: string[] }>>;
  primaryJourneys: Array<Tagged<UserJourney>>;
  nonGoals: Array<Tagged<string>>;
}

export interface DomainEntity {
  name: string;
  fields: Array<{ name: string; type: string; nullable?: boolean; note?: string }>;
  relationships: string[];
}

export interface Ownership {
  entity: string;
  owner: string;
  rlsRule: string;
}

export interface Integration {
  name: string;
  purpose: string;
  auth: string;
  dataFlow: string;
}

export interface AiResponsibility {
  task: string;
  model: string;
  fallback: string;
}

export interface FailureRecovery {
  scenario: string;
  detection: string;
  recovery: string;
}

export interface Screen {
  name: string;
  purpose: string;
  entryFrom: string[];
}

export interface UserState {
  state: string;
  transitions: Array<{ to: string; trigger: string }>;
}

export interface ArchitectureModel {
  screens: Array<Tagged<Screen>>;
  userStates: Array<Tagged<UserState>>;
  domainEntities: Array<Tagged<DomainEntity>>;
  ownership: Array<Tagged<Ownership>>;
  integrations: Array<Tagged<Integration>>;
  aiResponsibilities: Array<Tagged<AiResponsibility>>;
  failureRecovery: Array<Tagged<FailureRecovery>>;
}

export interface DecisionRegisterItem {
  id: string;
  area: "dna" | "architecture" | "checkpoint";
  path: string;              // e.g. "coreFeatures[2]" or "domainEntities[0]"
  title: string;
  detail: string;
  status: DecisionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Checkpoint {
  id: string;
  createdAt: string;
  exactGoal: string;
  whyThisNext: string;
  allowedFiles: string[];
  requirements: string[];
  exclusions: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
  expectedReport: string;
  dependsOnDecisions: string[]; // decision ids
  status: "draft" | "ready" | "done" | "skipped";
}

export interface ValidationFinding {
  severity: "error" | "warn" | "info";
  code:
    | "vendor_claim_unsupported"
    | "invalid_sql_type"
    | "entity_missing_pk"
    | "entity_missing_ownership"
    | "unresolved_decision_blocks_checkpoint"
    | "oversized_checkpoint"
    | "incomplete_output";
  message: string;
  ref?: string;
}

export interface ValidationReport {
  ranAt: string;
  isDraft: boolean;
  findings: ValidationFinding[];
}

export type InputKind = "idea" | "description" | "repo";

export interface RepoContext {
  url: string;
  owner: string;
  repo: string;
  readme: string | null;
  topLevel: string[];
  fetchedAt: string;
}

export type CompilerView =
  | "input"
  | "dna"
  | "architecture"
  | "decisions"
  | "checkpoint"
  | "validation";
