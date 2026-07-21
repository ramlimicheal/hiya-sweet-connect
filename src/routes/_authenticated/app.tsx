import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Cpu,
  Layers,
  ListChecks,
  Target,
  ShieldCheck,
  Plus,
  Trash2,
  Loader2,
  Github as GithubIcon,
  FileText,
  Wand2,
  LogOut,
  Check,
  AlertTriangle,
  X,
  RefreshCw,
  Copy,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  compileDNA,
  compileArchitecture,
  planNextCheckpoint,
  validateArchitecture,
  fetchRepoContext,
  listCompilerProjects,
  saveCompilerProject,
  deleteCompilerProject,
  type CompilerProject,
} from "@/lib/architect.functions";
import { getAiUsageToday } from "@/lib/ai.functions";
import type {
  CompilerView,
  DecisionStatus,
  DecisionRegisterItem,
  ProductDNAv2,
  ArchitectureModel,
  Checkpoint,
  ValidationReport,
  Tagged,
  InputKind,
  RepoContext,
} from "@/types";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Compiler — Elite Canvas" },
      { name: "description", content: "AI Product Architecture Compiler." },
      { property: "og:title", content: "Compiler — Elite Canvas" },
      { property: "og:description", content: "Compile ideas and repos into product architecture." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompilerPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_META: Record<DecisionStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  confirmed: { label: "Confirmed", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: <Check className="h-3 w-3" /> },
  proposed: { label: "Proposed", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30", icon: <Sparkles className="h-3 w-3" /> },
  assumed: { label: "Assumed", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: <AlertTriangle className="h-3 w-3" /> },
  unresolved: { label: "Unresolved", cls: "bg-red-500/15 text-red-300 border-red-500/30", icon: <X className="h-3 w-3" /> },
};

function StatusBadge({ status, onCycle }: { status: DecisionStatus; onCycle?: () => void }) {
  const m = STATUS_META[status];
  return (
    <button
      onClick={onCycle}
      disabled={!onCycle}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.cls} ${onCycle ? "hover:opacity-80 cursor-pointer" : "cursor-default"}`}
      title={onCycle ? "Click to change status" : undefined}
    >
      {m.icon}
      {m.label}
    </button>
  );
}

const CYCLE: DecisionStatus[] = ["proposed", "confirmed", "assumed", "unresolved"];
function cycleStatus(s: DecisionStatus): DecisionStatus {
  const i = CYCLE.indexOf(s);
  return CYCLE[(i + 1) % CYCLE.length];
}

function detectInputKind(text: string): InputKind {
  const trimmed = text.trim();
  if (/^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/i.test(trimmed)) return "repo";
  if (trimmed.length > 400) return "description";
  return "idea";
}

function newProjectState(): Partial<CompilerProject> {
  return {
    id: undefined,
    name: "Untitled Project",
    inputKind: "idea",
    idea: "",
    repoUrl: null,
    repoContext: null,
    dnaV2: null,
    architecture: null,
    decisions: [],
    checkpoints: [],
    validation: null,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function CompilerPage() {
  const navigate = useNavigate();
  const listFn = useServerFn(listCompilerProjects);
  const saveFn = useServerFn(saveCompilerProject);
  const deleteFn = useServerFn(deleteCompilerProject);
  const compileDnaFn = useServerFn(compileDNA);
  const compileArchFn = useServerFn(compileArchitecture);
  const planFn = useServerFn(planNextCheckpoint);
  const validateFn = useServerFn(validateArchitecture);
  const fetchRepoFn = useServerFn(fetchRepoContext);
  const usageFn = useServerFn(getAiUsageToday);

  const [view, setView] = useState<CompilerView>("input");
  const [projects, setProjects] = useState<CompilerProject[]>([]);
  const [active, setActive] = useState<Partial<CompilerProject>>(newProjectState());
  const [busy, setBusy] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ used: number; remaining: number; dayLimit: number }>({ used: 0, remaining: 25, dayLimit: 25 });
  const [repoUrlInput, setRepoUrlInput] = useState("");
  const [priorityHint, setPriorityHint] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshUsage = useCallback(async () => {
    try { setUsage(await usageFn()); } catch { /* ignore */ }
  }, [usageFn]);

  useEffect(() => {
    (async () => {
      try {
        const list = await listFn();
        setProjects(list);
        if (list.length > 0) setActive(list[0]);
      } catch (e) {
        console.error(e);
      }
      refreshUsage();
    })();
  }, [listFn, refreshUsage]);

  // Autosave (debounced) whenever active changes and has content
  useEffect(() => {
    if (!active.name) return;
    if (!active.idea && !active.dnaV2 && !active.architecture) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const saved = await saveFn({
          data: {
            id: active.id,
            name: active.name!,
            input_kind: (active.inputKind ?? "idea") as InputKind,
            idea: active.idea ?? "",
            repo_url: active.repoUrl ?? null,
            repo_context: active.repoContext ?? null,
            dna_v2: active.dnaV2 ?? null,
            architecture: active.architecture ?? null,
            decisions: active.decisions ?? [],
            checkpoints: active.checkpoints ?? [],
            validation: active.validation ?? null,
          },
        });
        setActive((prev) => ({ ...prev, id: saved.id, createdAt: saved.createdAt, updatedAt: saved.updatedAt }));
        setProjects((ps) => {
          const others = ps.filter((p) => p.id !== saved.id);
          return [saved, ...others];
        });
      } catch (e) {
        console.error("autosave failed", e);
      }
    }, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
     
  }, [active, saveFn]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const newProject = () => {
    setActive(newProjectState());
    setView("input");
    setRepoUrlInput("");
  };

  const deleteProject = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    try {
      await deleteFn({ data: { id } });
      setProjects((ps) => ps.filter((p) => p.id !== id));
      if (active.id === id) newProject();
      toast.success("Project deleted");
    } catch (e) {
      toast.error("Delete failed");
      console.error(e);
    }
  };

  // -------------------------------------------------------------------------
  // Compile actions
  // -------------------------------------------------------------------------
  const runFetchRepo = async () => {
    if (!repoUrlInput.trim()) return;
    setBusy("repo");
    try {
      const ctx = await fetchRepoFn({ data: { url: repoUrlInput.trim() } });
      setActive((a) => ({ ...a, inputKind: "repo", repoUrl: ctx.url, repoContext: ctx, idea: a.idea || `${ctx.owner}/${ctx.repo}` }));
      toast.success(`Fetched ${ctx.owner}/${ctx.repo}`);
    } catch (e) {
      toast.error("Could not fetch repository");
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const runCompileDna = async () => {
    if (!active.idea?.trim() && !active.repoContext) {
      toast.error("Add an idea, description, or repository first");
      return;
    }
    setBusy("dna");
    try {
      const inputKind = active.repoContext ? "repo" : detectInputKind(active.idea ?? "");
      const dna = await compileDnaFn({
        data: {
          inputKind,
          content: active.idea ?? "",
          repoContext: active.repoContext ?? undefined,
        },
      });
      const decisions = decisionsFromDna(dna);
      setActive((a) => ({ ...a, inputKind, dnaV2: dna, name: dna.projectName || a.name, decisions: mergeDecisions(a.decisions ?? [], decisions) }));
      setView("dna");
      toast.success("DNA compiled");
      refreshUsage();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "compile_failed";
      toast.error(msg === "ai_daily_limit_reached" ? "Daily AI limit reached (25/day)" : "DNA compile failed");
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const runCompileArch = async () => {
    if (!active.dnaV2) { toast.error("Compile DNA first"); return; }
    setBusy("arch");
    try {
      const arch = await compileArchFn({ data: { dna: active.dnaV2 } });
      const decisions = decisionsFromArch(arch);
      setActive((a) => ({ ...a, architecture: arch, decisions: mergeDecisions(a.decisions ?? [], decisions) }));
      setView("architecture");
      toast.success("Architecture compiled");
      refreshUsage();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "compile_failed";
      toast.error(msg === "ai_daily_limit_reached" ? "Daily AI limit reached (25/day)" : "Architecture compile failed");
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const runPlanCheckpoint = async () => {
    if (!active.dnaV2) { toast.error("Compile DNA first"); return; }
    setBusy("plan");
    try {
      const cp = await planFn({
        data: {
          dna: active.dnaV2,
          architecture: active.architecture ?? null,
          decisions: active.decisions ?? [],
          completed: (active.checkpoints ?? []).filter((c) => c.status === "done"),
          priorityHint: priorityHint || undefined,
        },
      });
      setActive((a) => ({ ...a, checkpoints: [cp, ...(a.checkpoints ?? [])] }));
      setView("checkpoint");
      toast.success("Next checkpoint ready");
      refreshUsage();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "plan_failed";
      toast.error(msg === "ai_daily_limit_reached" ? "Daily AI limit reached (25/day)" : "Checkpoint planning failed");
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const runValidate = async () => {
    setBusy("validate");
    try {
      const report = await validateFn({
        data: {
          dna: active.dnaV2 ?? null,
          architecture: active.architecture ?? null,
          checkpoint: (active.checkpoints ?? [])[0] ?? null,
          decisions: active.decisions ?? [],
        },
      });
      setActive((a) => ({ ...a, validation: report }));
      setView("validation");
      const errs = report.findings.filter((f) => f.severity === "error").length;
      toast[errs > 0 ? "warning" : "success"](
        errs > 0 ? `${errs} architecture issues found` : "Validation clean",
      );
    } catch (e) {
      toast.error("Validation failed");
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const updateDnaField = (path: string, updater: (prev: ProductDNAv2) => ProductDNAv2) => {
    void path;
    setActive((a) => (a.dnaV2 ? { ...a, dnaV2: updater(a.dnaV2) } : a));
  };

  const cycleDecision = (id: string) => {
    setActive((a) => ({
      ...a,
      decisions: (a.decisions ?? []).map((d) =>
        d.id === id ? { ...d, status: cycleStatus(d.status), updatedAt: new Date().toISOString() } : d,
      ),
    }));
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-72 border-r border-white/10 min-h-screen p-4 flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="h-5 w-5 text-emerald-400" />
              <h1 className="text-sm font-bold tracking-wide">ELITE CANVAS</h1>
            </div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">AI Product Architecture Compiler</p>
          </div>

          <button
            onClick={newProject}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400 transition"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>

          <nav className="flex flex-col gap-1 mt-2">
            {(
              [
                { id: "input", label: "Input", icon: FileText },
                { id: "dna", label: "Product DNA", icon: Sparkles },
                { id: "architecture", label: "Architecture", icon: Layers },
                { id: "decisions", label: "Decisions", icon: ListChecks },
                { id: "checkpoint", label: "Checkpoint", icon: Target },
                { id: "validation", label: "Validation", icon: ShieldCheck },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const activeCls = view === item.id ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5";
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition ${activeCls}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-4">
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Projects</p>
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              {projects.length === 0 && <p className="text-xs text-gray-600">No projects yet</p>}
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`group flex items-center justify-between px-2 py-1.5 rounded ${active.id === p.id ? "bg-white/10" : "hover:bg-white/5"}`}
                >
                  <button
                    onClick={() => { setActive(p); setView(p.dnaV2 ? "dna" : "input"); }}
                    className="text-xs text-left flex-1 truncate"
                    title={p.name}
                  >
                    {p.name}
                  </button>
                  <button
                    onClick={() => deleteProject(p.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto space-y-3">
            <div className="p-3 rounded-lg border border-white/10 bg-white/5">
              <div className="flex justify-between text-[10px] uppercase text-gray-400 mb-1">
                <span>Daily AI usage</span>
                <span>{usage.used}/{usage.dayLimit}</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded overflow-hidden">
                <div
                  className="h-full bg-emerald-400"
                  style={{ width: `${Math.min(100, (usage.used / usage.dayLimit) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Resets 00:00 UTC</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-8 max-w-5xl">
          {view === "input" && (
            <InputView
              active={active}
              setActive={setActive}
              repoUrlInput={repoUrlInput}
              setRepoUrlInput={setRepoUrlInput}
              runFetchRepo={runFetchRepo}
              runCompileDna={runCompileDna}
              busy={busy}
            />
          )}
          {view === "dna" && (
            <DnaView
              dna={active.dnaV2 ?? null}
              onEdit={updateDnaField}
              onRecompile={runCompileDna}
              onCompileArch={runCompileArch}
              busy={busy}
            />
          )}
          {view === "architecture" && (
            <ArchitectureView arch={active.architecture ?? null} onRecompile={runCompileArch} busy={busy} />
          )}
          {view === "decisions" && (
            <DecisionsView decisions={active.decisions ?? []} onCycle={cycleDecision} />
          )}
          {view === "checkpoint" && (
            <CheckpointView
              checkpoints={active.checkpoints ?? []}
              priorityHint={priorityHint}
              setPriorityHint={setPriorityHint}
              onPlan={runPlanCheckpoint}
              validation={active.validation ?? null}
              busy={busy}
              onMarkDone={(id) =>
                setActive((a) => ({
                  ...a,
                  checkpoints: (a.checkpoints ?? []).map((c) => (c.id === id ? { ...c, status: "done" } : c)),
                }))
              }
            />
          )}
          {view === "validation" && (
            <ValidationView report={active.validation ?? null} onRun={runValidate} busy={busy} />
          )}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision extraction helpers
// ---------------------------------------------------------------------------
function nid(): string { return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`; }
function now(): string { return new Date().toISOString(); }

function decisionsFromDna(dna: ProductDNAv2): DecisionRegisterItem[] {
  const out: DecisionRegisterItem[] = [];
  const push = (path: string, title: string, detail: string, status: DecisionStatus) => {
    out.push({ id: nid(), area: "dna", path, title, detail, status, createdAt: now(), updatedAt: now() });
  };
  push("problem", "Problem statement", dna.problem.value, dna.problem.status);
  push("desiredOutcome", "Desired outcome", dna.desiredOutcome.value, dna.desiredOutcome.status);
  dna.coreFeatures.forEach((f, i) => push(`coreFeatures[${i}]`, `Core feature: ${f.value}`, f.value, f.status));
  dna.nonGoals.forEach((f, i) => push(`nonGoals[${i}]`, `Non-goal: ${f.value}`, f.value, f.status));
  return out;
}

function decisionsFromArch(arch: ArchitectureModel): DecisionRegisterItem[] {
  const out: DecisionRegisterItem[] = [];
  arch.domainEntities.forEach((e, i) => {
    out.push({ id: nid(), area: "architecture", path: `domainEntities[${i}]`, title: `Entity: ${e.value.name}`, detail: `${e.value.fields.length} fields`, status: e.status, createdAt: now(), updatedAt: now() });
  });
  arch.integrations.forEach((intg, i) => {
    out.push({ id: nid(), area: "architecture", path: `integrations[${i}]`, title: `Integration: ${intg.value.name}`, detail: intg.value.purpose, status: intg.status, createdAt: now(), updatedAt: now() });
  });
  return out;
}

function mergeDecisions(existing: DecisionRegisterItem[], incoming: DecisionRegisterItem[]): DecisionRegisterItem[] {
  const existingByPath = new Map(existing.map((d) => [`${d.area}:${d.path}`, d]));
  const merged: DecisionRegisterItem[] = [];
  for (const inc of incoming) {
    const key = `${inc.area}:${inc.path}`;
    const prev = existingByPath.get(key);
    if (prev) {
      // preserve user-confirmed decisions; otherwise update from AI
      merged.push(prev.status === "confirmed" ? prev : { ...prev, detail: inc.detail, status: inc.status, updatedAt: now() });
      existingByPath.delete(key);
    } else {
      merged.push(inc);
    }
  }
  // keep leftover existing (e.g. manual additions)
  for (const leftover of existingByPath.values()) merged.push(leftover);
  return merged;
}

// ---------------------------------------------------------------------------
// Subviews
// ---------------------------------------------------------------------------
function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-300">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function InputView(props: {
  active: Partial<CompilerProject>;
  setActive: React.Dispatch<React.SetStateAction<Partial<CompilerProject>>>;
  repoUrlInput: string;
  setRepoUrlInput: (s: string) => void;
  runFetchRepo: () => void;
  runCompileDna: () => void;
  busy: string | null;
}) {
  const { active, setActive, repoUrlInput, setRepoUrlInput, runFetchRepo, runCompileDna, busy } = props;
  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-bold mb-1">Input</h2>
        <p className="text-sm text-gray-400">Paste an idea, existing project description, or a public GitHub URL. The compiler auto-detects the input kind.</p>
      </header>

      <Card title="Project name">
        <input
          value={active.name ?? ""}
          onChange={(e) => setActive((a) => ({ ...a, name: e.target.value }))}
          className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm"
          placeholder="Untitled Project"
        />
      </Card>

      <Card title="Idea or description">
        <textarea
          value={active.idea ?? ""}
          onChange={(e) => setActive((a) => ({ ...a, idea: e.target.value }))}
          rows={8}
          className="w-full bg-black/40 border border-white/10 rounded p-3 text-sm font-mono"
          placeholder="Describe the product, the problem, the users, and anything specific you already know…"
        />
      </Card>

      <Card
        title="Public GitHub repository (optional)"
        action={
          <span className="text-[10px] text-gray-500">Reads README + top-level tree</span>
        }
      >
        <div className="flex gap-2">
          <input
            value={repoUrlInput}
            onChange={(e) => setRepoUrlInput(e.target.value)}
            className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm"
            placeholder="https://github.com/owner/repo"
          />
          <button
            onClick={runFetchRepo}
            disabled={busy === "repo" || !repoUrlInput.trim()}
            className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {busy === "repo" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Github className="h-3 w-3" />}
            Fetch
          </button>
        </div>
        {active.repoContext && (
          <div className="mt-3 p-3 rounded bg-black/40 border border-white/10">
            <p className="text-xs text-emerald-300 font-mono">{active.repoContext.owner}/{active.repoContext.repo}</p>
            <p className="text-[10px] text-gray-500 mt-1">{active.repoContext.topLevel.length} top-level entries · README {active.repoContext.readme ? "loaded" : "missing"}</p>
          </div>
        )}
      </Card>

      <button
        onClick={runCompileDna}
        disabled={!!busy}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-sm transition"
      >
        {busy === "dna" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        Compile Product DNA
      </button>
    </>
  );
}

function EditableTagged({ item, onChange }: { item: Tagged<string>; onChange: (t: Tagged<string>) => void }) {
  return (
    <div className="flex items-start gap-2 mb-2">
      <textarea
        value={item.value}
        onChange={(e) => onChange({ ...item, value: e.target.value })}
        rows={2}
        className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
      />
      <StatusBadge status={item.status} onCycle={() => onChange({ ...item, status: cycleStatus(item.status) })} />
    </div>
  );
}

function DnaView({
  dna,
  onEdit,
  onRecompile,
  onCompileArch,
  busy,
}: {
  dna: ProductDNAv2 | null;
  onEdit: (path: string, updater: (prev: ProductDNAv2) => ProductDNAv2) => void;
  onRecompile: () => void;
  onCompileArch: () => void;
  busy: string | null;
}) {
  if (!dna) {
    return <EmptyState title="No DNA yet" hint="Go to Input and compile the DNA first." />;
  }
  const setList = (key: keyof ProductDNAv2) => (idx: number, next: Tagged<string>) => {
    onEdit(String(key), (prev) => {
      const list = [...(prev[key] as Array<Tagged<string>>)];
      list[idx] = next;
      return { ...prev, [key]: list } as ProductDNAv2;
    });
  };

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{dna.projectName}</h2>
          <p className="text-sm text-gray-400">Every field is a decision. Cycle the status badge to change it.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onRecompile} disabled={!!busy} className="px-3 py-2 text-xs rounded bg-white/10 hover:bg-white/20 flex items-center gap-2">
            {busy === "dna" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Recompile
          </button>
          <button onClick={onCompileArch} disabled={!!busy} className="px-3 py-2 text-xs rounded bg-emerald-500 text-black font-semibold hover:bg-emerald-400 flex items-center gap-2">
            {busy === "arch" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Layers className="h-3 w-3" />} Compile Architecture
          </button>
        </div>
      </header>

      <Card title="Problem">
        <textarea
          value={dna.problem.value}
          onChange={(e) => onEdit("problem", (p) => ({ ...p, problem: { ...p.problem, value: e.target.value } }))}
          rows={2}
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm"
        />
        <div className="mt-2"><StatusBadge status={dna.problem.status} onCycle={() => onEdit("problem", (p) => ({ ...p, problem: { ...p.problem, status: cycleStatus(p.problem.status) } }))} /></div>
      </Card>

      <Card title="Desired outcome">
        <textarea
          value={dna.desiredOutcome.value}
          onChange={(e) => onEdit("desiredOutcome", (p) => ({ ...p, desiredOutcome: { ...p.desiredOutcome, value: e.target.value } }))}
          rows={2}
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-sm"
        />
        <div className="mt-2"><StatusBadge status={dna.desiredOutcome.status} onCycle={() => onEdit("desiredOutcome", (p) => ({ ...p, desiredOutcome: { ...p.desiredOutcome, status: cycleStatus(p.desiredOutcome.status) } }))} /></div>
      </Card>

      <Card title="Target users">
        {dna.targetUsers.map((u, i) => (
          <EditableTagged key={i} item={u} onChange={(t) => setList("targetUsers")(i, t)} />
        ))}
      </Card>

      <Card title="Core features">
        {dna.coreFeatures.map((f, i) => (
          <EditableTagged key={i} item={f} onChange={(t) => setList("coreFeatures")(i, t)} />
        ))}
      </Card>

      <Card title="Non-goals">
        {dna.nonGoals.map((f, i) => (
          <EditableTagged key={i} item={f} onChange={(t) => setList("nonGoals")(i, t)} />
        ))}
      </Card>

      <Card title="Product boundaries">
        {dna.productBoundaries.map((f, i) => (
          <EditableTagged key={i} item={f} onChange={(t) => setList("productBoundaries")(i, t)} />
        ))}
      </Card>

      <Card title="User roles">
        {dna.userRoles.map((r, i) => (
          <div key={i} className="mb-2 p-2 bg-black/40 border border-white/10 rounded">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-emerald-300">{r.value.role}</span>
              <StatusBadge status={r.status} />
            </div>
            <p className="text-[11px] text-gray-400">{r.value.permissions.join(", ")}</p>
          </div>
        ))}
      </Card>

      <Card title="Primary journeys">
        {dna.primaryJourneys.map((j, i) => (
          <div key={i} className="mb-3 p-3 bg-black/40 border border-white/10 rounded">
            <div className="flex justify-between mb-1">
              <span className="text-xs font-semibold">{j.value.actor} → {j.value.goal}</span>
              <StatusBadge status={j.status} />
            </div>
            <ol className="text-[11px] text-gray-400 list-decimal ml-4 space-y-0.5">
              {j.value.steps.map((s, k) => <li key={k}>{s}</li>)}
            </ol>
          </div>
        ))}
      </Card>
    </>
  );
}

function ArchitectureView({ arch, onRecompile, busy }: { arch: ArchitectureModel | null; onRecompile: () => void; busy: string | null }) {
  if (!arch) return <EmptyState title="No architecture yet" hint="Compile the DNA first, then generate the architecture model." />;
  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Architecture</h2>
          <p className="text-sm text-gray-400">Screens, states, entities, ownership, integrations, AI, failure modes.</p>
        </div>
        <button onClick={onRecompile} disabled={!!busy} className="px-3 py-2 text-xs rounded bg-white/10 hover:bg-white/20 flex items-center gap-2">
          {busy === "arch" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Recompile
        </button>
      </header>

      <Card title={`Screens (${arch.screens.length})`}>
        {arch.screens.map((s, i) => (
          <div key={i} className="mb-2 p-2 bg-black/40 border border-white/10 rounded">
            <div className="flex justify-between mb-1"><span className="text-xs font-semibold">{s.value.name}</span><StatusBadge status={s.status} /></div>
            <p className="text-[11px] text-gray-400">{s.value.purpose}</p>
            {s.value.entryFrom.length > 0 && <p className="text-[10px] text-gray-500 mt-1">Entry: {s.value.entryFrom.join(", ")}</p>}
          </div>
        ))}
      </Card>

      <Card title={`Domain entities (${arch.domainEntities.length})`}>
        {arch.domainEntities.map((e, i) => (
          <div key={i} className="mb-3 p-3 bg-black/40 border border-white/10 rounded">
            <div className="flex justify-between mb-2"><span className="text-xs font-semibold text-emerald-300">{e.value.name}</span><StatusBadge status={e.status} /></div>
            <table className="w-full text-[11px]">
              <tbody>
                {e.value.fields.map((f, k) => (
                  <tr key={k} className="border-t border-white/5">
                    <td className="py-1 pr-2 font-mono">{f.name}</td>
                    <td className="py-1 pr-2 text-emerald-300 font-mono">{f.type}</td>
                    <td className="py-1 text-gray-500">{f.note ?? (f.nullable ? "nullable" : "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {e.value.relationships.length > 0 && <p className="text-[10px] text-gray-500 mt-2">Relations: {e.value.relationships.join(" · ")}</p>}
          </div>
        ))}
      </Card>

      <Card title={`Ownership & RLS (${arch.ownership.length})`}>
        {arch.ownership.map((o, i) => (
          <div key={i} className="mb-2 p-2 bg-black/40 border border-white/10 rounded">
            <div className="flex justify-between mb-1"><span className="text-xs font-semibold">{o.value.entity} — owner: {o.value.owner}</span><StatusBadge status={o.status} /></div>
            <p className="text-[11px] text-gray-400 font-mono">{o.value.rlsRule}</p>
          </div>
        ))}
      </Card>

      <Card title={`Integrations (${arch.integrations.length})`}>
        {arch.integrations.map((int, i) => (
          <div key={i} className="mb-2 p-2 bg-black/40 border border-white/10 rounded">
            <div className="flex justify-between mb-1"><span className="text-xs font-semibold">{int.value.name}</span><StatusBadge status={int.status} /></div>
            <p className="text-[11px] text-gray-400">{int.value.purpose}</p>
            <p className="text-[10px] text-gray-500 mt-1">Auth: {int.value.auth} · Flow: {int.value.dataFlow}</p>
          </div>
        ))}
      </Card>

      <Card title={`AI responsibilities (${arch.aiResponsibilities.length})`}>
        {arch.aiResponsibilities.map((a, i) => (
          <div key={i} className="mb-2 p-2 bg-black/40 border border-white/10 rounded">
            <div className="flex justify-between mb-1"><span className="text-xs font-semibold">{a.value.task}</span><StatusBadge status={a.status} /></div>
            <p className="text-[11px] text-gray-400">Model: <span className="font-mono">{a.value.model}</span> · Fallback: {a.value.fallback}</p>
          </div>
        ))}
      </Card>

      <Card title={`Failure & recovery (${arch.failureRecovery.length})`}>
        {arch.failureRecovery.map((f, i) => (
          <div key={i} className="mb-2 p-2 bg-black/40 border border-white/10 rounded">
            <div className="flex justify-between mb-1"><span className="text-xs font-semibold">{f.value.scenario}</span><StatusBadge status={f.status} /></div>
            <p className="text-[11px] text-gray-400">Detection: {f.value.detection}</p>
            <p className="text-[11px] text-gray-400">Recovery: {f.value.recovery}</p>
          </div>
        ))}
      </Card>

      <Card title={`User states (${arch.userStates.length})`}>
        {arch.userStates.map((s, i) => (
          <div key={i} className="mb-2 p-2 bg-black/40 border border-white/10 rounded">
            <div className="flex justify-between mb-1"><span className="text-xs font-semibold">{s.value.state}</span><StatusBadge status={s.status} /></div>
            <ul className="text-[11px] text-gray-400">
              {s.value.transitions.map((t, k) => <li key={k}>→ {t.to} <span className="text-gray-600">on {t.trigger}</span></li>)}
            </ul>
          </div>
        ))}
      </Card>
    </>
  );
}

function DecisionsView({ decisions, onCycle }: { decisions: DecisionRegisterItem[]; onCycle: (id: string) => void }) {
  const grouped = useMemo(() => {
    const g: Record<DecisionStatus, DecisionRegisterItem[]> = { confirmed: [], proposed: [], assumed: [], unresolved: [] };
    for (const d of decisions) g[d.status].push(d);
    return g;
  }, [decisions]);
  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-bold">Decision Register</h2>
        <p className="text-sm text-gray-400">Every recommendation is tagged. Click a status badge to change it. Assumptions never silently become facts.</p>
      </header>
      {(["unresolved", "assumed", "proposed", "confirmed"] as DecisionStatus[]).map((s) => (
        <Card key={s} title={`${STATUS_META[s].label} (${grouped[s].length})`}>
          {grouped[s].length === 0 && <p className="text-xs text-gray-600">None.</p>}
          {grouped[s].map((d) => (
            <div key={d.id} className="mb-2 p-2 bg-black/40 border border-white/10 rounded flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-xs font-semibold">{d.title}</p>
                <p className="text-[11px] text-gray-500 font-mono">{d.area} · {d.path}</p>
                {d.detail !== d.title && <p className="text-[11px] text-gray-400 mt-1">{d.detail}</p>}
              </div>
              <StatusBadge status={d.status} onCycle={() => onCycle(d.id)} />
            </div>
          ))}
        </Card>
      ))}
    </>
  );
}

function CheckpointView({
  checkpoints,
  priorityHint,
  setPriorityHint,
  onPlan,
  validation,
  busy,
  onMarkDone,
}: {
  checkpoints: Checkpoint[];
  priorityHint: string;
  setPriorityHint: (s: string) => void;
  onPlan: () => void;
  validation: ValidationReport | null;
  busy: string | null;
  onMarkDone: (id: string) => void;
}) {
  const isDraft = validation?.isDraft ?? false;
  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-bold">Adaptive Checkpoint</h2>
        <p className="text-sm text-gray-400">Generates the smallest next unit of work based on dependencies, risk, unresolved decisions, and existing state.</p>
      </header>

      {isDraft && (
        <div className="mb-4 p-3 rounded border border-red-500/40 bg-red-500/10 text-xs text-red-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Bundle is <strong>Draft</strong> — validation found blocking issues. See Validation tab.
        </div>
      )}

      <Card title="Priority hint (optional)">
        <input
          value={priorityHint}
          onChange={(e) => setPriorityHint(e.target.value)}
          className="w-full bg-black/40 border border-white/10 rounded px-2 py-2 text-sm"
          placeholder="e.g. Prioritize the payment flow, defer notifications"
        />
        <button
          onClick={onPlan}
          disabled={!!busy}
          className="mt-3 flex items-center gap-2 px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs disabled:opacity-50"
        >
          {busy === "plan" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />} Plan next checkpoint
        </button>
      </Card>

      {checkpoints.map((cp) => (
        <Card
          key={cp.id}
          title={`${cp.status === "done" ? "✓ " : ""}Checkpoint`}
          action={
            <div className="flex gap-2">
              <button
                onClick={() => copyBundle(cp)}
                className="text-[10px] px-2 py-1 rounded bg-white/10 hover:bg-white/20 flex items-center gap-1"
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
              {cp.status !== "done" && (
                <button
                  onClick={() => onMarkDone(cp.id)}
                  className="text-[10px] px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
                >
                  Mark done
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <Field label="Exact goal">{cp.exactGoal}</Field>
            <Field label="Why this next">{cp.whyThisNext}</Field>
            <Field label="Allowed files"><code className="text-[11px] font-mono">{cp.allowedFiles.join(", ")}</code></Field>
            <Field label="Requirements"><ul className="list-disc ml-5 space-y-1">{cp.requirements.map((r, i) => <li key={i} className="text-xs">{r}</li>)}</ul></Field>
            <Field label="Exclusions"><ul className="list-disc ml-5 space-y-1">{cp.exclusions.map((r, i) => <li key={i} className="text-xs text-gray-400">{r}</li>)}</ul></Field>
            <Field label="Acceptance criteria"><ul className="list-disc ml-5 space-y-1">{cp.acceptanceCriteria.map((r, i) => <li key={i} className="text-xs">{r}</li>)}</ul></Field>
            <Field label="Verification commands"><pre className="text-[11px] font-mono bg-black/40 p-2 rounded border border-white/10 whitespace-pre-wrap">{cp.verificationCommands.join("\n")}</pre></Field>
            <Field label="Expected return report"><p className="text-xs text-gray-300">{cp.expectedReport}</p></Field>
          </div>
        </Card>
      ))}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  );
}

function copyBundle(cp: Checkpoint) {
  const md = `# Checkpoint

## Exact goal
${cp.exactGoal}

## Why this next
${cp.whyThisNext}

## Allowed files
${cp.allowedFiles.map((f) => `- ${f}`).join("\n")}

## Requirements
${cp.requirements.map((r) => `- ${r}`).join("\n")}

## Exclusions
${cp.exclusions.map((r) => `- ${r}`).join("\n")}

## Acceptance criteria
${cp.acceptanceCriteria.map((r) => `- ${r}`).join("\n")}

## Verification commands
\`\`\`
${cp.verificationCommands.join("\n")}
\`\`\`

## Expected return report
${cp.expectedReport}
`;
  navigator.clipboard.writeText(md).then(() => toast.success("Checkpoint copied"));
}

function ValidationView({ report, onRun, busy }: { report: ValidationReport | null; onRun: () => void; busy: string | null }) {
  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Validation</h2>
          <p className="text-sm text-gray-400">Vendor claims, SQL types, ownership rules, unresolved decisions, checkpoint sizing.</p>
        </div>
        <button
          onClick={onRun}
          disabled={!!busy}
          className="px-3 py-2 text-xs rounded bg-emerald-500 text-black font-semibold hover:bg-emerald-400 flex items-center gap-2"
        >
          {busy === "validate" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Run validation
        </button>
      </header>

      {!report && <EmptyState title="No validation report" hint="Click 'Run validation' to check the current bundle." />}

      {report && (
        <>
          <div className={`mb-4 p-3 rounded border text-xs ${report.isDraft ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"}`}>
            {report.isDraft ? "Bundle labeled DRAFT — errors present." : "Bundle is READY."}
            <span className="text-gray-500 ml-2">Ran {new Date(report.ranAt).toLocaleString()}</span>
          </div>

          {report.findings.length === 0 && <p className="text-xs text-gray-500">No findings. Everything looks structurally sound.</p>}

          {report.findings.map((f, i) => (
            <div
              key={i}
              className={`mb-2 p-3 rounded border text-xs ${
                f.severity === "error"
                  ? "border-red-500/40 bg-red-500/5 text-red-200"
                  : f.severity === "warn"
                    ? "border-amber-500/40 bg-amber-500/5 text-amber-200"
                    : "border-white/10 bg-white/5 text-gray-300"
              }`}
            >
              <p className="font-semibold uppercase text-[10px] tracking-widest mb-1">{f.severity} · {f.code}</p>
              <p>{f.message}</p>
              {f.ref && <p className="text-[10px] text-gray-500 mt-1">Ref: {f.ref}</p>}
            </div>
          ))}
        </>
      )}
    </>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Cpu className="h-10 w-10 text-gray-700 mb-3" />
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{hint}</p>
    </div>
  );
}
