import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import {
  Brain,
  Cpu,
  Layers,
  Terminal,
  Send,
  Settings,
  Sparkles,
  Copy,
  Check,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Lock,
  Info,
  Upload,
  FileText,
  Pencil,
  X,
  FileDown,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useServerFn } from "@tanstack/react-start";
import type { ProjectDNA, BuildPhase, ViewType } from "@/types";
import { DEFAULT_PHASES } from "@/data/phases";
import { analyzeIdea, autowriteIdea } from "@/lib/ai.functions";
import {
  AVAILABLE_MODELS,
  DEFAULT_SELECTION,
  isValidSelection,
  autoModelFor,
  type ModelSelection,
} from "@/lib/models";
import {
  loadStore,
  saveStore,
  makeEmptyProject,
  deriveProjectName,
  type ProjectSnapshot,
  type ProjectsStore,
} from "@/lib/projects";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Elite Canvas — AI Product Architecture Studio" },
      {
        name: "description",
        content:
          "Elite Canvas is an AI Product Architecture Studio — turn a raw product idea into a full Project DNA and a 15-phase prompt pack.",
      },
      { property: "og:title", content: "Elite Canvas — AI Product Architecture Studio" },
      {
        property: "og:description",
        content:
          "AI Product Architecture Studio — from raw idea to Project DNA and a 15-phase prompt pack.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EliteCanvas,
});

function EliteCanvas() {
  const analyzeFn = useServerFn(analyzeIdea);
  const autowriteFn = useServerFn(autowriteIdea);
  const [autowriting, setAutowriting] = useState(false);

  const handleAutowrite = async () => {
    if (!idea.trim()) {
      showToast("Write a rough idea first, then Autowrite will polish it.");
      return;
    }
    setAutowriting(true);
    try {
      const { idea: rewritten } = await autowriteFn({ data: { idea, productType, stage, model } });
      setIdea(rewritten);
      showToast("✨ Vision rewritten by Elite AI.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Autowrite failed.";
      if (msg.includes("ai_access_denied")) {
        showToast("AI access is in closed beta. Request an access grant.");
      } else {
        showToast(`Error: ${msg}`);
      }
    } finally {
      setAutowriting(false);
    }
  };

  // === STATES ===
  const [idea, setIdea] = useState("");
  const [productType, setProductType] = useState("Automatically determine");
  const [stage, setStage] = useState("New application");
  const [constraints, setConstraints] = useState("");
  const [references, setReferences] = useState("");

  const [view, setView] = useState<ViewType>("idea");
  const [dna, setDna] = useState<ProjectDNA | null>(null);
  const [phases, setPhases] = useState<BuildPhase[]>(DEFAULT_PHASES);
  const [activePhaseId, setActivePhaseId] = useState("master");
  const [canvasOutputs, setCanvasOutputs] = useState<
    Array<{ title: string; content: string; timestamp: string }>
  >([]);

  const [depth, setDepth] = useState("deep");
  const [stack, setStack] = useState(
    "Lovable defaults with React, TypeScript, Tailwind and Supabase",
  );
  const [motionIntensity, setMotionIntensity] = useState("refined");
  const [model, setModel] = useState<ModelSelection>(DEFAULT_SELECTION);

  const [loading, setLoading] = useState(false);
  const [generatingPhaseId, setGeneratingPhaseId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });
  const [copiedId, setCopiedId] = useState(false);
  const [outputMode, setOutputMode] = useState<"rendered" | "raw">("rendered");

  const [editingDna, setEditingDna] = useState(false);
  const [dnaDraft, setDnaDraft] = useState<ProjectDNA | null>(null);

  // === PROJECT REGISTRY (multi-project memory) ===
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [projectsMenuOpen, setProjectsMenuOpen] = useState(false);

  // Load registry on mount, hydrate active project into working state.
  useEffect(() => {
    const store = loadStore();
    // Global settings (kept separate from projects — they're user preferences)
    try {
      const savedSettings = localStorage.getItem("elite_canvas_settings");
      if (savedSettings) {
        const p = JSON.parse(savedSettings);
        if (p.depth) setDepth(p.depth);
        if (p.stack) setStack(p.stack);
        if (p.motionIntensity) setMotionIntensity(p.motionIntensity);
        if (p.model && isValidSelection(p.model)) setModel(p.model);
      }
    } catch (e) {
      console.error(e);
    }

    if (store.projects.length === 0) {
      setProjects([]);
      setActiveProjectId(null);
      setHydrated(true);
      return;
    }
    const active = store.projects.find((p) => p.id === store.activeId) ?? store.projects[0];
    setProjects(store.projects);
    setActiveProjectId(active.id);
    hydrateFromProject(active);
    setHydrated(true);
  }, []);

  // Auto-persist working state into the active project's snapshot.
  useEffect(() => {
    if (!hydrated || !activeProjectId) return;
    setProjects((prev) => {
      const next = prev.map((p) =>
        p.id === activeProjectId
          ? {
              ...p,
              idea,
              productType,
              stage,
              constraints,
              references,
              dna,
              phases,
              canvasOutputs,
              name: deriveProjectName({ dna, idea }),
              updatedAt: Date.now(),
            }
          : p,
      );
      saveStore({ activeId: activeProjectId, projects: next });
      return next;
    });
  }, [
    hydrated,
    activeProjectId,
    idea,
    productType,
    stage,
    constraints,
    references,
    dna,
    phases,
    canvasOutputs,
  ]);

  // Persist global settings whenever they change.
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      "elite_canvas_settings",
      JSON.stringify({ depth, stack, motionIntensity, model }),
    );
  }, [hydrated, depth, stack, motionIntensity, model]);

  function hydrateFromProject(p: ProjectSnapshot) {
    setIdea(p.idea);
    setProductType(p.productType);
    setStage(p.stage);
    setConstraints(p.constraints);
    setReferences(p.references);
    setDna(p.dna);
    setPhases(p.phases.length ? p.phases : DEFAULT_PHASES);
    setCanvasOutputs(p.canvasOutputs);
    setActivePhaseId("master");
    setView(p.dna ? "dna" : "idea");
  }

  function ensureActiveProject(): string {
    // Creates a project on first meaningful action if none exists.
    if (activeProjectId) return activeProjectId;
    const proj = makeEmptyProject();
    setProjects((prev) => {
      const next = [...prev, proj];
      saveStore({ activeId: proj.id, projects: next });
      return next;
    });
    setActiveProjectId(proj.id);
    return proj.id;
  }

  const handleNewProject = () => {
    const proj = makeEmptyProject();
    setProjects((prev) => {
      const next = [...prev, proj];
      saveStore({ activeId: proj.id, projects: next });
      return next;
    });
    setActiveProjectId(proj.id);
    hydrateFromProject(proj);
    setProjectsMenuOpen(false);
    showToast("Started a new project. Previous one is saved.");
  };

  const handleSwitchProject = (id: string) => {
    if (id === activeProjectId) {
      setProjectsMenuOpen(false);
      return;
    }
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    saveStore({ activeId: id, projects });
    setActiveProjectId(id);
    hydrateFromProject(target);
    setProjectsMenuOpen(false);
    showToast(`Switched to "${target.name}".`);
  };

  const handleDeleteProject = (id: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    if (!confirm(`Delete project "${target.name}"? This cannot be undone.`)) return;
    const next = projects.filter((p) => p.id !== id);
    if (id === activeProjectId) {
      if (next.length === 0) {
        // Nothing left — clear working state.
        setProjects([]);
        setActiveProjectId(null);
        saveStore({ activeId: null, projects: [] });
        setIdea("");
        setConstraints("");
        setReferences("");
        setDna(null);
        setPhases(
          DEFAULT_PHASES.map((p) => ({
            ...p,
            generatedPrompt: undefined,
            status: "idle" as const,
          })),
        );
        setCanvasOutputs([]);
        setView("idea");
      } else {
        const nextActive = next[0];
        setProjects(next);
        setActiveProjectId(nextActive.id);
        saveStore({ activeId: nextActive.id, projects: next });
        hydrateFromProject(nextActive);
      }
    } else {
      setProjects(next);
      saveStore({ activeId: activeProjectId, projects: next });
    }
    showToast(`Deleted "${target.name}".`);
  };

  // Kept for legacy calls — now writes are handled by the auto-persist effect.
  const saveToLocal = (_dna: ProjectDNA | null, _phases: BuildPhase[], _canvas = canvasOutputs) => {
    void _dna;
    void _phases;
    void _canvas;
  };

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 4000);
  };

  const loadExample = () => {
    ensureActiveProject();
    setIdea(
      "Build a premium, high-converting subscription platform for professional visual artists to showcase their 3D animations, sell digital assets, and offer direct commissioning. It needs a client management dashboard, encrypted file deliveries, automated watermarking, and seamless global payments.",
    );
    setProductType("SaaS application");
    setStage("New application");
    setConstraints(
      "Must integrate Supabase Auth & Storage. Client-side should handle high-speed 3D media renders smoothly. Encrypted files must utilize secure signed URLs.",
    );
    setReferences(
      "Linear-style dark aesthetic, clean glassmorphism, dynamic glowing interactive panels, and Stripe-like checkout clarity.",
    );
    showToast("Example product vision loaded successfully.");
  };

  const resetProject = () => {
    if (
      confirm(
        "Clear the current project's data (DNA, prompts, canvas)? The project entry remains — use the Projects menu to fully delete it.",
      )
    ) {
      setIdea("");
      setConstraints("");
      setReferences("");
      setDna(null);
      setPhases(
        DEFAULT_PHASES.map((p) => ({ ...p, generatedPrompt: undefined, status: "idle" as const })),
      );
      setCanvasOutputs([]);
      setView("idea");
      showToast("Current project cleared.");
    }
  };

  const handleAnalyze = async () => {
    if (!idea.trim()) {
      showToast("Please enter a product vision first.");
      return;
    }
    ensureActiveProject();
    setLoading(true);
    try {
      const parsedDna = await analyzeFn({
        data: { idea, productType, stage, constraints, references, model },
      });
      setDna(parsedDna);
      const resetPhases = DEFAULT_PHASES.map((p) => ({
        ...p,
        status: "idle" as const,
        generatedPrompt: undefined,
      }));
      setPhases(resetPhases);
      saveToLocal(parsedDna, resetPhases);
      setView("dna");
      showToast(`⚡ Project DNA Created: "${parsedDna.projectName}"`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to reach AI.";
      console.error(error);
      showToast(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePrompt = async (phaseId: string) => {
    if (!dna) {
      showToast("No Project DNA available. Please analyze an idea first.");
      return;
    }
    const targetIdx = phases.findIndex((p) => p.id === phaseId);
    if (targetIdx === -1) return;
    setGeneratingPhaseId(phaseId);
    setActivePhaseId(phaseId);
    setView("output");

    const startingPhases = [...phases];
    startingPhases[targetIdx] = {
      ...startingPhases[targetIdx],
      status: "generating",
      generatedPrompt: "",
    };
    setPhases(startingPhases);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/generate-phase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          dna,
          phase: startingPhases[targetIdx],
          depth,
          stack,
          motionIntensity,
          model,
        }),
      });
      if (res.status === 401) {
        showToast("Session expired. Please sign in again.");
        window.location.href = "/auth";
        return;
      }
      if (res.status === 403) {
        showToast("AI access is in closed beta. Request an access grant to generate prompts.");
        setPhases((prev) => {
          const next = [...prev];
          const idx = next.findIndex((p) => p.id === phaseId);
          if (idx !== -1) next[idx] = { ...next[idx], status: "idle", generatedPrompt: undefined };
          return next;
        });
        return;
      }
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Stream failed (${res.status})`);
      }
      const source = (
        res.headers.get("X-Elite-Canvas-Source") === "fallback" ? "fallback" : "ai"
      ) as "ai" | "fallback";
      const usedModel = res.headers.get("X-Elite-Canvas-Model") ?? undefined;
      const rawReason = res.headers.get("X-Elite-Canvas-Fallback-Reason");
      const APPROVED_REASONS = [
        "missing_api_key",
        "empty_model_response",
        "gateway_timeout",
        "rate_limited",
        "invalid_model_output",
        "generation_failed",
      ] as const;
      type ReasonCode = (typeof APPROVED_REASONS)[number];
      const REASON_LABEL: Record<ReasonCode, string> = {
        missing_api_key: "AI gateway not configured",
        empty_model_response: "model returned no content",
        gateway_timeout: "gateway timed out",
        rate_limited: "rate limited",
        invalid_model_output: "model output was invalid",
        generation_failed: "generation failed",
      };
      const fallbackReason: ReasonCode | null =
        rawReason && (APPROVED_REASONS as readonly string[]).includes(rawReason)
          ? (rawReason as ReasonCode)
          : source === "fallback"
            ? "generation_failed"
            : null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setPhases((prev) => {
          const next = [...prev];
          const idx = next.findIndex((p) => p.id === phaseId);
          if (idx !== -1) next[idx] = { ...next[idx], generatedPrompt: acc };
          return next;
        });
      }
      setPhases((prev) => {
        const next = [...prev];
        const idx = next.findIndex((p) => p.id === phaseId);
        if (idx !== -1)
          next[idx] = {
            ...next[idx],
            generatedPrompt: acc,
            status: "completed",
            source,
            model: source === "ai" ? usedModel : undefined,
          };
        saveToLocal(dna, next);
        return next;
      });
      if (source === "fallback") {
        const label = fallbackReason
          ? REASON_LABEL[fallbackReason]
          : REASON_LABEL.generation_failed;
        showToast(`Phase ${startingPhases[targetIdx].number}: template fallback (${label}).`);
      } else {
        showToast(
          `Prompt generated for Phase ${startingPhases[targetIdx].number}${usedModel ? ` via ${usedModel}` : ""}`,
        );
      }
    } catch (error: unknown) {
      console.error(error);
      setPhases((prev) => {
        const next = [...prev];
        const idx = next.findIndex((p) => p.id === phaseId);
        if (idx !== -1) next[idx] = { ...next[idx], status: "error", generatedPrompt: undefined };
        return next;
      });
      showToast(`Prompt generation failed (generation_failed).`);
    } finally {
      setGeneratingPhaseId(null);
    }
  };

  const handleGenerateAllMissing = async () => {
    if (!dna) {
      showToast("Please build Project DNA first.");
      return;
    }
    showToast("Generating prompts sequentially. Please don't close the window.");
    for (const phase of phases) {
      if (!phase.generatedPrompt && phase.status !== "generating") {
        await handleGeneratePrompt(phase.id);
      }
    }
    showToast("All prompts generated successfully!");
  };

  // === DNA EDITING ===
  const startEditDna = () => {
    if (dna) {
      setDnaDraft(JSON.parse(JSON.stringify(dna)));
      setEditingDna(true);
    }
  };
  const cancelEditDna = () => {
    setDnaDraft(null);
    setEditingDna(false);
  };
  const saveEditDna = () => {
    if (!dnaDraft) return;
    setDna(dnaDraft);
    saveToLocal(dnaDraft, phases);
    setEditingDna(false);
    setDnaDraft(null);
    showToast("Project DNA updated.");
  };
  const updateDraft = (patch: Partial<ProjectDNA>) =>
    setDnaDraft((d) => (d ? { ...d, ...patch } : d));

  // === MARKDOWN EXPORT ===
  const handleExportMarkdown = () => {
    if (!dna) {
      showToast("Nothing to export yet.");
      return;
    }
    const md: string[] = [
      `# ${dna.projectName}`,
      ``,
      `**Architecture Readiness:** ${dna.readiness}%`,
      ``,
      `## Executive Summary`,
      ``,
      dna.summary,
      ``,
      `## Key Product Dimensions`,
      ``,
      ...dna.features.map((f) => `- ${f}`),
      ``,
      `## User Roles`,
      ``,
      ...dna.userRoles.flatMap((r) => [
        `### ${r.role}`,
        ``,
        ...r.permissions.map((p) => `- ${p}`),
        ``,
      ]),
      `## Critical Decisions`,
      ``,
      ...dna.criticalDecisions.flatMap((d, i) => [
        `### ${i + 1}. ${d.title}`,
        ``,
        d.description,
        ``,
        `**Recommendation:** ${d.recommendation}`,
        ``,
      ]),
      `## Technical Architecture`,
      ``,
      dna.architecture,
      ``,
      `---`,
      ``,
      `# Prompt Pack`,
      ``,
    ];
    const completed = phases.filter((p) => p.generatedPrompt);
    if (completed.length === 0) {
      md.push(`_No phase prompts generated yet._`, ``);
    } else {
      for (const p of completed) {
        md.push(`## Phase ${p.number} — ${p.title}`, ``, p.generatedPrompt!, ``, `---`, ``);
      }
    }
    const blob = new Blob([md.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dna.projectName.toLowerCase().replace(/\s+/g, "_")}_bundle.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Markdown bundle downloaded.");
  };

  const handleCopyPrompt = () => {
    const activePhase = phases.find((p) => p.id === activePhaseId);
    if (!activePhase?.generatedPrompt) {
      showToast("No generated prompt content to copy.");
      return;
    }
    navigator.clipboard.writeText(activePhase.generatedPrompt);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
    showToast(`Copied Phase ${activePhase.number} prompt to clipboard.`);
  };

  const handleSendToCanvas = () => {
    const activePhase = phases.find((p) => p.id === activePhaseId);
    if (!activePhase?.generatedPrompt) {
      showToast("No generated prompt to send to Canvas.");
      return;
    }
    if (canvasOutputs.some((item) => item.title.includes(activePhase.title))) {
      showToast("This phase is already in your Canvas workspace.");
      return;
    }
    const newOutput = {
      title: `Phase ${activePhase.number} - ${activePhase.title}`,
      content: activePhase.generatedPrompt,
      timestamp: new Date().toLocaleTimeString(),
    };
    const updatedCanvas = [newOutput, ...canvasOutputs];
    setCanvasOutputs(updatedCanvas);
    saveToLocal(dna, phases, updatedCanvas);
    showToast(`Phase ${activePhase.number} successfully pushed to Canvas workspace.`);
  };

  const handleClearCanvas = () => {
    if (confirm("Are you sure you want to clear your Canvas Output history?")) {
      setCanvasOutputs([]);
      saveToLocal(dna, phases, []);
      showToast("Canvas output history cleared.");
    }
  };

  const handleExportProject = () => {
    if (!dna) {
      showToast("Nothing to export yet.");
      return;
    }
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify({ dna, phases, canvasOutputs }));
    const a = document.createElement("a");
    a.setAttribute("href", dataStr);
    a.setAttribute(
      "download",
      `${dna.projectName.toLowerCase().replace(/\s+/g, "_")}_elite_project.json`,
    );
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast("Project configurations downloaded as JSON.");
  };

  const handleImportProject = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed.dna) {
          showToast("Invalid project file structure.");
          return;
        }
        const imported = makeEmptyProject();
        imported.dna = parsed.dna;
        imported.phases = parsed.phases || imported.phases;
        imported.canvasOutputs = parsed.canvasOutputs || [];
        imported.name = deriveProjectName(imported);
        setProjects((prev) => {
          const next = [...prev, imported];
          saveStore({ activeId: imported.id, projects: next });
          return next;
        });
        setActiveProjectId(imported.id);
        hydrateFromProject(imported);
        showToast(`Imported project: "${imported.name}"`);
      } catch {
        showToast("Failed to parse JSON project file.");
      }
    };
    reader.readAsText(file);
  };

  const totalPrompts = phases.length;
  const completedPrompts = phases.filter((p) => p.generatedPrompt).length;
  const progressPercent = dna ? Math.round((completedPrompts / totalPrompts) * 100) : 0;

  const renderArchitectureMarkdown = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, idx) => {
      if (line.startsWith("### "))
        return (
          <h4 key={idx} className="text-sm font-semibold text-zinc-300 mt-6 mb-2 tracking-tight">
            {line.replace("### ", "")}
          </h4>
        );
      if (line.startsWith("## "))
        return (
          <h3
            key={idx}
            className="text-base font-bold text-zinc-200 mt-8 mb-3 border-b border-white/5 pb-1 tracking-tight"
          >
            {line.replace("## ", "")}
          </h3>
        );
      if (line.startsWith("# "))
        return (
          <h2
            key={idx}
            className="text-lg font-black text-white mt-10 mb-4 tracking-tight uppercase border-l-2 border-zinc-400 pl-3"
          >
            {line.replace("# ", "")}
          </h2>
        );
      if (line.startsWith("- ") || line.startsWith("* "))
        return (
          <li key={idx} className="ml-5 list-disc text-xs text-gray-300 mb-1 leading-relaxed">
            {line.substring(2)}
          </li>
        );
      if (line.match(/^\d+\.\s/))
        return (
          <li key={idx} className="ml-5 list-decimal text-xs text-gray-300 mb-1 leading-relaxed">
            {line.replace(/^\d+\.\s/, "")}
          </li>
        );
      if (line.trim() === "") return <div key={idx} className="h-2" />;
      return (
        <p key={idx} className="text-xs text-gray-300 mb-2 leading-relaxed">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#000000] text-[#f5f5f7] font-sans antialiased selection:bg-zinc-400/30 selection:text-white">
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-zinc-700/10 blur-[120px]" />
        <div className="absolute top-[20%] right-[-10%] w-[45%] h-[45%] rounded-full bg-zinc-500/5 blur-[120px]" />
      </div>

      {/* SIDEBAR */}
      <aside className="w-full md:w-64 flex flex-col border-b md:border-b-0 md:border-r border-white/10 bg-[#0a0a0b]/90 backdrop-blur-xl z-10 sticky top-0 md:h-screen md:overflow-y-auto shrink-0">
        <div className="p-5 flex items-center gap-3 border-b border-white/5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-400/30 bg-gradient-to-br from-zinc-700/20 to-zinc-400/5 shadow-[0_8px_24px_rgba(255,255,255,0.15)]">
            <span className="text-lg">⚡</span>
          </div>
          <div className="flex-1 min-w-0">
            <span className="block text-sm font-black tracking-tight text-white font-display">
              Elite Canvas
            </span>
            <span className="block text-[10px] text-gray-500 font-semibold tracking-wider uppercase">
              AI Product Architecture Studio
            </span>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
            title="Sign out"
            className="text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-white transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>


        {/* PROJECTS SWITCHER */}
        <div className="p-3 border-b border-white/5">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[9px] font-extrabold tracking-wider text-gray-500 uppercase">
              Projects · Memory
            </span>
            <button
              onClick={handleNewProject}
              title="Save current & start a new project"
              className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-2 py-1 transition-all cursor-pointer"
            >
              <Plus className="h-2.5 w-2.5" /> New
            </button>
          </div>
          <div className="relative">
            <button
              onClick={() => setProjectsMenuOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs bg-black/40 hover:bg-white/5 border border-white/10 transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2 min-w-0">
                <FileText className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                <span className="truncate font-bold text-white">
                  {activeProjectId
                    ? (projects.find((p) => p.id === activeProjectId)?.name ?? "Untitled")
                    : "No project"}
                </span>
              </span>
              <span className="text-[9px] text-gray-500 font-mono">{projects.length}</span>
            </button>
            {projectsMenuOpen && (
              <div className="absolute left-0 right-0 mt-1.5 z-30 bg-[#0a0a0b] border border-white/10 rounded-lg shadow-2xl max-h-80 overflow-auto">
                {projects.length === 0 ? (
                  <div className="p-3 text-[11px] text-gray-500">
                    No saved projects. Analyze an idea to create one.
                  </div>
                ) : (
                  projects
                    .slice()
                    .sort((a, b) => b.updatedAt - a.updatedAt)
                    .map((p) => (
                      <div
                        key={p.id}
                        className={`group flex items-center gap-1 px-2 py-1.5 hover:bg-white/5 transition-colors ${p.id === activeProjectId ? "bg-zinc-400/10" : ""}`}
                      >
                        <button
                          onClick={() => handleSwitchProject(p.id)}
                          className="flex-1 min-w-0 text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            {p.id === activeProjectId && (
                              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                            )}
                            <span className="text-[11px] font-bold text-white truncate">
                              {p.name}
                            </span>
                          </div>
                          <div className="text-[9px] text-gray-500 font-mono ml-4">
                            {p.dna
                              ? `${p.phases.filter((ph) => ph.generatedPrompt).length}/${p.phases.length} prompts`
                              : "no DNA yet"}
                            {" · "}
                            {new Date(p.updatedAt).toLocaleDateString()}
                          </div>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(p.id);
                          }}
                          title="Delete this project"
                          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 p-1 transition-all cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-3">
          <span className="px-3 py-2 block text-[9px] font-extrabold tracking-wider text-gray-500 uppercase">
            Workspace navigation
          </span>
          <nav className="space-y-1">
            {[
              { id: "idea", label: "01 · Product Vision", icon: Brain, gated: false },
              {
                id: "dna",
                label: "02 · Project DNA",
                icon: Cpu,
                gated: !dna,
                gateMsg: "Analyze a product vision to view Project DNA.",
              },
              {
                id: "phases",
                label: "03 · Prompt Pack",
                icon: Layers,
                gated: !dna,
                gateMsg: "Analyze a product vision to view the Prompt Pack.",
              },
              {
                id: "output",
                label: "04 · Copy & Apply",
                icon: Terminal,
                gated: !phases.some((p) => p.generatedPrompt),
                gateMsg: "Generate at least one prompt to view outputs.",
              },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.gated) {
                      showToast(item.gateMsg!);
                      return;
                    }
                    setView(item.id as ViewType);
                  }}
                  disabled={item.gated}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${item.gated ? "opacity-50 cursor-not-allowed" : ""} ${
                    isActive
                      ? "bg-zinc-400/10 border border-zinc-400/20 text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-zinc-300" : "text-gray-500"}`} />
                  {item.label}
                </button>
              );
            })}
            <button
              onClick={() => setView("canvas")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${view === "canvas" ? "bg-zinc-400/10 border border-zinc-400/20 text-white" : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"}`}
            >
              <span className="flex items-center gap-3">
                <Send
                  className={`h-4 w-4 ${view === "canvas" ? "text-zinc-300" : "text-gray-500"}`}
                />
                05 · Canvas Output
              </span>
              {canvasOutputs.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-zinc-400 text-white text-[9px] font-black">
                  {canvasOutputs.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setView("settings")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${view === "settings" ? "bg-zinc-400/10 border border-zinc-400/20 text-white" : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"}`}
            >
              <Settings
                className={`h-4 w-4 ${view === "settings" ? "text-zinc-300" : "text-gray-500"}`}
              />
              06 · Settings
            </button>
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-white/5 bg-black/40 text-[11px] space-y-3">
          <div>
            <div className="flex justify-between items-center text-gray-500 font-semibold mb-1 uppercase tracking-wider text-[9px]">
              <span>Active Project</span>
              {dna && (
                <button
                  onClick={resetProject}
                  className="text-[9px] font-bold text-gray-500 hover:text-red-400 transition-colors cursor-pointer inline-flex items-center gap-1"
                  title="Clear current project"
                >
                  <Trash2 className="h-2.5 w-2.5" /> Clear
                </button>
              )}
            </div>
            <span
              className={`font-extrabold truncate block ${dna ? "text-white" : "text-gray-600 italic font-medium"}`}
            >
              {dna ? dna.projectName : "No project yet"}
            </span>
          </div>
          {dna && (
            <>
              <div>
                <div className="flex justify-between text-gray-500 font-semibold mb-1 uppercase tracking-wider text-[9px]">
                  <span>Architecture Readiness</span>
                  <span className="text-white font-bold">{dna.readiness}%</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-zinc-400 to-zinc-300 h-full rounded-full transition-all duration-500"
                    style={{ width: `${dna.readiness}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-gray-500 font-semibold mb-1 uppercase tracking-wider text-[9px]">
                  <span>Prompts Completed</span>
                  <span className="text-white font-bold">
                    {completedPrompts} / {totalPrompts}
                  </span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-zinc-300 to-emerald-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            </>
          )}
          {!dna && (
            <p className="text-[10px] text-gray-600 leading-relaxed">
              Enter a product vision and run{" "}
              <span className="text-gray-400 font-semibold">Analyze</span> to create your Project
              DNA.
            </p>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full z-10 overflow-x-hidden">
        <AnimatePresence mode="wait">
          {view === "idea" && (
            <motion.div
              key="idea"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div>
                <span className="text-[10px] tracking-[0.2em] uppercase font-black text-zinc-300 font-display">
                  Step 01 · Vision Alignment
                </span>
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mt-1 font-display">
                  What should Lovable build?
                </h1>
                <p className="text-sm text-gray-400 max-w-2xl mt-1.5 leading-relaxed">
                  Provide the raw conceptual spark. Elite uses Lovable AI to structure your idea
                  into production-grade systems, data models, and a phased prompt pack.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-6">
                  <div className="border border-white/10 rounded-2xl bg-[#101012]/90 backdrop-blur-xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 h-24 w-24 bg-zinc-400/5 rounded-full blur-2xl" />
                    <div className="space-y-5">
                      <div>
                        <div className="flex justify-between items-center mb-2 gap-3">
                          <label className="text-xs font-black uppercase tracking-wider text-gray-300">
                            Complete Product vision
                          </label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={handleAutowrite}
                              disabled={autowriting || !idea.trim()}
                              className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-zinc-400/40 text-[10px] font-bold uppercase tracking-wider text-gray-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Rewrite your vision with Elite AI"
                            >
                              {autowriting ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" /> Rewriting…
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3 h-3 text-zinc-300 group-hover:text-white" />{" "}
                                  Autowrite
                                </>
                              )}
                            </button>
                            <span className="text-[10px] text-gray-500 font-semibold hidden sm:inline">
                              Write naturally and deeply
                            </span>
                          </div>
                        </div>
                        <textarea
                          value={idea}
                          onChange={(e) => setIdea(e.target.value)}
                          className="w-full h-48 px-4 py-3 text-sm bg-[#050506] border border-white/5 rounded-xl outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/20 text-gray-200 resize-none transition-all placeholder:text-gray-600 leading-relaxed font-sans"
                          placeholder="Example: Build a high-performance wellness tracker..."
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-black uppercase tracking-wider text-gray-300 mb-2">
                            Application Type
                          </label>
                          <select
                            value={productType}
                            onChange={(e) => setProductType(e.target.value)}
                            className="w-full h-11 px-3 bg-[#050506] border border-white/5 rounded-xl outline-none focus:border-zinc-400 text-sm text-gray-300 font-medium"
                          >
                            <option>Automatically determine</option>
                            <option>SaaS application</option>
                            <option>Micro-SaaS</option>
                            <option>AI application</option>
                            <option>Marketplace</option>
                            <option>E-commerce application</option>
                            <option>Dashboard or internal tool</option>
                            <option>Client portal</option>
                            <option>Portfolio experience</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-black uppercase tracking-wider text-gray-300 mb-2">
                            Project Current State
                          </label>
                          <select
                            value={stage}
                            onChange={(e) => setStage(e.target.value)}
                            className="w-full h-11 px-3 bg-[#050506] border border-white/5 rounded-xl outline-none focus:border-zinc-400 text-sm text-gray-300 font-medium"
                          >
                            <option>New application</option>
                            <option>Existing Lovable project</option>
                            <option>Existing product requiring redesign</option>
                            <option>MVP requiring production hardening</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-black uppercase tracking-wider text-gray-300 mb-2 block">
                          Technical Constraints{" "}
                          <span className="text-gray-600 font-normal italic">(Optional)</span>
                        </label>
                        <textarea
                          value={constraints}
                          onChange={(e) => setConstraints(e.target.value)}
                          className="w-full h-20 px-4 py-2.5 text-xs bg-[#050506] border border-white/5 rounded-xl outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/20 text-gray-200 resize-none transition-all placeholder:text-gray-600"
                          placeholder="Example: Must use Supabase, Stripe globally..."
                        />
                      </div>

                      <div>
                        <label className="text-xs font-black uppercase tracking-wider text-gray-300 mb-2 block">
                          Style references & Vibe{" "}
                          <span className="text-gray-600 font-normal italic">(Optional)</span>
                        </label>
                        <textarea
                          value={references}
                          onChange={(e) => setReferences(e.target.value)}
                          className="w-full h-20 px-4 py-2.5 text-xs bg-[#050506] border border-white/5 rounded-xl outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400/20 text-gray-200 resize-none transition-all placeholder:text-gray-600"
                          placeholder="Example: Linear-style precision dark-theme..."
                        />
                      </div>

                      <div className="pt-4 flex flex-wrap gap-3">
                        <button
                          onClick={handleAnalyze}
                          disabled={loading}
                          className="inline-flex items-center justify-center h-12 px-6 rounded-xl text-xs font-black tracking-wider uppercase text-white bg-gradient-to-r from-zinc-700 to-zinc-800 hover:from-zinc-400 hover:to-zinc-700 transition-all shadow-[0_8px_24px_rgba(255,255,255,0.3)] disabled:opacity-50 cursor-pointer"
                        >
                          {loading ? (
                            <span className="flex items-center gap-2">
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Constructing Project DNA...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Sparkles className="h-4 w-4" />
                              Analyze and Build DNA
                            </span>
                          )}
                        </button>
                        <button
                          onClick={loadExample}
                          className="inline-flex items-center justify-center h-12 px-5 rounded-xl text-xs font-bold text-gray-300 border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
                        >
                          Load Example Vibe
                        </button>
                        <button
                          onClick={resetProject}
                          className="inline-flex items-center justify-center h-12 w-12 rounded-xl text-gray-400 hover:text-red-400 border border-white/10 bg-white/5 hover:bg-red-500/10 hover:border-red-500/20 transition-all cursor-pointer"
                          title="Reset workspace"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                  <div className="border border-white/10 rounded-2xl bg-[#101012]/90 backdrop-blur-xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white font-display flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-zinc-300" />
                      Elite Capabilities
                    </h3>
                    <ul className="space-y-3.5 text-xs text-gray-400">
                      <li className="flex gap-2.5">
                        <CheckCircle2 className="h-4 w-4 text-zinc-300 shrink-0 mt-0.5" />
                        <span>
                          Generates a complete production architecture covering DB Schemas, RLS
                          rules, and components.
                        </span>
                      </li>
                      <li className="flex gap-2.5">
                        <CheckCircle2 className="h-4 w-4 text-zinc-300 shrink-0 mt-0.5" />
                        <span>
                          Creates 15 individual prompt templates tailored to your specific tech
                          choice.
                        </span>
                      </li>
                      <li className="flex gap-2.5">
                        <CheckCircle2 className="h-4 w-4 text-zinc-300 shrink-0 mt-0.5" />
                        <span>
                          Builds working features, responsive flows, full state connections, and
                          robust error safeguards.
                        </span>
                      </li>
                    </ul>
                  </div>
                  <div className="border border-white/10 rounded-2xl bg-gradient-to-br from-zinc-900/10 to-transparent p-5 space-y-3">
                    <span className="text-[10px] font-black uppercase text-zinc-300">
                      Powered by Lovable AI
                    </span>
                    <h4 className="text-xs font-extrabold text-white">Zero API Key Setup</h4>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      AI runs through the built-in Lovable AI Gateway. No keys to manage, no
                      accounts to link — just build.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === "dna" && dna && (
            <motion.div
              key="dna"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <span className="text-[10px] tracking-[0.2em] uppercase font-black text-zinc-300 font-display">
                    Step 02 · Project DNA
                  </span>
                  <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1 font-display">
                    Project DNA: {dna.projectName}
                  </h1>
                  <p className="text-xs text-gray-400 mt-1">
                    Structured product architecture generated by Elite.
                  </p>
                </div>
                <div className="flex gap-2.5 flex-wrap">
                  {editingDna ? (
                    <>
                      <button
                        onClick={saveEditDna}
                        className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-500 transition-all cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5 mr-2" />
                        Save Changes
                      </button>
                      <button
                        onClick={cancelEditDna}
                        className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-xs font-bold text-gray-300 border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5 mr-2" />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={startEditDna}
                        className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-xs font-bold text-zinc-200 border border-zinc-400/20 bg-zinc-400/10 hover:bg-zinc-400/20 transition-all cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-2" />
                        Edit DNA
                      </button>
                      <button
                        onClick={handleExportMarkdown}
                        className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-xs font-bold text-zinc-200 border border-zinc-400/20 bg-zinc-400/10 hover:bg-zinc-400/20 transition-all cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5 mr-2" />
                        Export MD
                      </button>
                      <button
                        onClick={handleExportProject}
                        className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-xs font-bold text-gray-300 border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5 mr-2" />
                        Export JSON
                      </button>
                      <label className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-xs font-bold text-gray-300 border border-white/10 bg-white/5 hover:bg-white/10 transition-all cursor-pointer">
                        <Upload className="h-3.5 w-3.5 mr-2" />
                        Import JSON
                        <input
                          type="file"
                          accept="application/json"
                          onChange={handleImportProject}
                          className="hidden"
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>

              {editingDna && dnaDraft ? (
                <div className="border border-zinc-400/20 rounded-2xl bg-[#101012]/90 backdrop-blur-xl p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300 mb-2">
                        Project Name
                      </label>
                      <input
                        value={dnaDraft.projectName}
                        onChange={(e) => updateDraft({ projectName: e.target.value })}
                        className="w-full h-11 px-3 bg-[#050506] border border-white/10 rounded-xl outline-none focus:border-zinc-400 text-sm text-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300 mb-2">
                        Readiness %
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={dnaDraft.readiness}
                        onChange={(e) =>
                          updateDraft({
                            readiness: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                          })
                        }
                        className="w-full h-11 px-3 bg-[#050506] border border-white/10 rounded-xl outline-none focus:border-zinc-400 text-sm text-white font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300 mb-2">
                      Executive Summary
                    </label>
                    <textarea
                      rows={4}
                      value={dnaDraft.summary}
                      onChange={(e) => updateDraft({ summary: e.target.value })}
                      className="w-full px-3 py-2.5 bg-[#050506] border border-white/10 rounded-xl outline-none focus:border-zinc-400 text-sm text-gray-200 leading-relaxed resize-y"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300">
                        Key Product Dimensions
                      </label>
                      <button
                        onClick={() => updateDraft({ features: [...dnaDraft.features, ""] })}
                        className="inline-flex items-center h-7 px-2 rounded-lg text-[10px] font-bold text-zinc-200 border border-zinc-400/20 bg-zinc-400/10 hover:bg-zinc-400/20 cursor-pointer"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </button>
                    </div>
                    <div className="space-y-2">
                      {dnaDraft.features.map((feat, fIdx) => (
                        <div key={fIdx} className="flex gap-2">
                          <input
                            value={feat}
                            onChange={(e) => {
                              const next = [...dnaDraft.features];
                              next[fIdx] = e.target.value;
                              updateDraft({ features: next });
                            }}
                            className="flex-1 h-9 px-3 bg-[#050506] border border-white/10 rounded-lg outline-none focus:border-zinc-400 text-xs text-gray-200"
                          />
                          <button
                            onClick={() =>
                              updateDraft({
                                features: dnaDraft.features.filter((_, i) => i !== fIdx),
                              })
                            }
                            className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-red-400 border border-red-500/10 bg-red-500/5 hover:bg-red-500/10 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300">
                        User Roles
                      </label>
                      <button
                        onClick={() =>
                          updateDraft({
                            userRoles: [...dnaDraft.userRoles, { role: "", permissions: [] }],
                          })
                        }
                        className="inline-flex items-center h-7 px-2 rounded-lg text-[10px] font-bold text-zinc-200 border border-zinc-400/20 bg-zinc-400/10 hover:bg-zinc-400/20 cursor-pointer"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Role
                      </button>
                    </div>
                    <div className="space-y-3">
                      {dnaDraft.userRoles.map((roleObj, rIdx) => (
                        <div
                          key={rIdx}
                          className="p-3 rounded-xl border border-white/10 bg-[#050506] space-y-2"
                        >
                          <div className="flex gap-2">
                            <input
                              value={roleObj.role}
                              onChange={(e) => {
                                const next = [...dnaDraft.userRoles];
                                next[rIdx] = { ...next[rIdx], role: e.target.value };
                                updateDraft({ userRoles: next });
                              }}
                              placeholder="Role name"
                              className="flex-1 h-9 px-3 bg-black/40 border border-white/10 rounded-lg outline-none focus:border-zinc-400 text-xs text-white font-bold"
                            />
                            <button
                              onClick={() =>
                                updateDraft({
                                  userRoles: dnaDraft.userRoles.filter((_, i) => i !== rIdx),
                                })
                              }
                              className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-red-400 border border-red-500/10 bg-red-500/5 hover:bg-red-500/10 cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <textarea
                            rows={2}
                            value={roleObj.permissions.join("\n")}
                            onChange={(e) => {
                              const next = [...dnaDraft.userRoles];
                              next[rIdx] = {
                                ...next[rIdx],
                                permissions: e.target.value
                                  .split("\n")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              };
                              updateDraft({ userRoles: next });
                            }}
                            placeholder="One permission per line"
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg outline-none focus:border-zinc-400 text-[11px] text-gray-300 resize-y font-mono"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300">
                        Critical Decisions
                      </label>
                      <button
                        onClick={() =>
                          updateDraft({
                            criticalDecisions: [
                              ...dnaDraft.criticalDecisions,
                              { title: "", description: "", recommendation: "" },
                            ],
                          })
                        }
                        className="inline-flex items-center h-7 px-2 rounded-lg text-[10px] font-bold text-zinc-200 border border-zinc-400/20 bg-zinc-400/10 hover:bg-zinc-400/20 cursor-pointer"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Decision
                      </button>
                    </div>
                    <div className="space-y-3">
                      {dnaDraft.criticalDecisions.map((d, dIdx) => (
                        <div
                          key={dIdx}
                          className="p-3 rounded-xl border border-white/10 bg-[#050506] space-y-2"
                        >
                          <div className="flex gap-2">
                            <input
                              value={d.title}
                              onChange={(e) => {
                                const next = [...dnaDraft.criticalDecisions];
                                next[dIdx] = { ...next[dIdx], title: e.target.value };
                                updateDraft({ criticalDecisions: next });
                              }}
                              placeholder="Decision title"
                              className="flex-1 h-9 px-3 bg-black/40 border border-white/10 rounded-lg outline-none focus:border-zinc-400 text-xs text-white font-bold"
                            />
                            <button
                              onClick={() =>
                                updateDraft({
                                  criticalDecisions: dnaDraft.criticalDecisions.filter(
                                    (_, i) => i !== dIdx,
                                  ),
                                })
                              }
                              className="inline-flex items-center justify-center h-9 w-9 rounded-lg text-red-400 border border-red-500/10 bg-red-500/5 hover:bg-red-500/10 cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <textarea
                            rows={2}
                            value={d.description}
                            onChange={(e) => {
                              const next = [...dnaDraft.criticalDecisions];
                              next[dIdx] = { ...next[dIdx], description: e.target.value };
                              updateDraft({ criticalDecisions: next });
                            }}
                            placeholder="Description"
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg outline-none focus:border-zinc-400 text-[11px] text-gray-300 resize-y"
                          />
                          <textarea
                            rows={2}
                            value={d.recommendation}
                            onChange={(e) => {
                              const next = [...dnaDraft.criticalDecisions];
                              next[dIdx] = { ...next[dIdx], recommendation: e.target.value };
                              updateDraft({ criticalDecisions: next });
                            }}
                            placeholder="Recommendation"
                            className="w-full px-3 py-2 bg-zinc-400/5 border border-zinc-400/10 rounded-lg outline-none focus:border-zinc-400 text-[11px] text-zinc-200 resize-y"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300 mb-2">
                      Technical Architecture (Markdown)
                    </label>
                    <textarea
                      rows={16}
                      value={dnaDraft.architecture}
                      onChange={(e) => updateDraft({ architecture: e.target.value })}
                      className="w-full px-3 py-2.5 bg-[#050506] border border-white/10 rounded-xl outline-none focus:border-zinc-400 text-xs text-gray-200 font-mono leading-relaxed resize-y"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-4 space-y-6">
                    <div className="border border-white/10 rounded-2xl bg-[#101012]/90 backdrop-blur-xl p-6 text-center space-y-4">
                      <span className="text-[10px] font-black uppercase text-zinc-300 tracking-wider">
                        Product Readiness
                      </span>
                      <div className="relative flex items-center justify-center">
                        <svg className="w-32 h-32 transform -rotate-90">
                          <circle
                            cx="64"
                            cy="64"
                            r="54"
                            stroke="rgba(255,255,255,0.03)"
                            strokeWidth="8"
                            fill="transparent"
                          />
                          <circle
                            cx="64"
                            cy="64"
                            r="54"
                            stroke="url(#violetGradient)"
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={2 * Math.PI * 54}
                            strokeDashoffset={2 * Math.PI * 54 * (1 - dna.readiness / 100)}
                            strokeLinecap="round"
                          />
                          <defs>
                            <linearGradient id="violetGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#fafafa" />
                              <stop offset="100%" stopColor="#71717a" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute flex flex-col items-center">
                          <span className="text-3xl font-black text-white font-display">
                            {dna.readiness}%
                          </span>
                          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                            AI estimate
                          </span>
                        </div>
                      </div>
                      <p
                        className="text-xs text-gray-400 leading-relaxed max-w-xs mx-auto"
                        title="This is the AI's self-reported confidence in the DNA it just wrote — not a measurement of your codebase. Treat as a rough heuristic, not a score."
                      >
                        Self-rated by the AI when generating the DNA — a heuristic, not a verified
                        measurement.
                      </p>
                    </div>

                    <div className="border border-white/10 rounded-2xl bg-[#101012]/90 backdrop-blur-xl p-5 space-y-4">
                      <span className="text-[10px] font-black uppercase text-zinc-300 tracking-wider block">
                        Defined System Roles
                      </span>
                      <div className="space-y-3">
                        {dna.userRoles.map((roleObj, rIdx) => (
                          <div
                            key={rIdx}
                            className="p-3 rounded-xl border border-white/5 bg-[#050506] space-y-1.5"
                          >
                            <span className="text-xs font-black text-white block">
                              {roleObj.role}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {roleObj.permissions.map((p, pIdx) => (
                                <span
                                  key={pIdx}
                                  className="text-[8px] font-bold bg-white/5 border border-white/5 px-1.5 py-0.5 rounded text-gray-400"
                                >
                                  {p}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-8 space-y-6">
                    <div className="border border-white/10 rounded-2xl bg-[#101012]/90 p-6 space-y-3">
                      <h3 className="text-sm font-black text-white uppercase tracking-wider font-display">
                        Executive Product Blueprint
                      </h3>
                      <p className="text-xs text-gray-300 leading-relaxed">{dna.summary}</p>
                      <div className="pt-4 border-t border-white/5">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2.5">
                          Key Product Dimensions
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {dna.features.map((feat, fIdx) => (
                            <div
                              key={fIdx}
                              className="flex items-center gap-2 p-2 border border-white/5 bg-[#050506] rounded-lg"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 shrink-0" />
                              <span className="text-xs text-gray-300 font-medium truncate">
                                {feat}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="border border-white/10 rounded-2xl bg-[#101012]/90 p-6 space-y-4">
                      <h3 className="text-sm font-black text-white uppercase tracking-wider font-display flex items-center justify-between">
                        <span>Critical Decisions Handled</span>
                        <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                          Defaults Pre-Set
                        </span>
                      </h3>
                      <div className="space-y-4">
                        {dna.criticalDecisions.map((decision, dIdx) => (
                          <div
                            key={dIdx}
                            className="p-4 border border-white/5 bg-[#050506] rounded-xl space-y-2 relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 px-2 py-1 bg-zinc-400/10 rounded-bl text-[8px] font-extrabold uppercase tracking-wider text-zinc-300">
                              Decision {dIdx + 1}
                            </div>
                            <span className="text-xs font-black text-white block pr-16">
                              {decision.title}
                            </span>
                            <p className="text-[11px] text-gray-400 leading-relaxed">
                              {decision.description}
                            </p>
                            <div className="pt-2 flex items-start gap-2 text-[11px] text-zinc-200 bg-zinc-400/5 p-2 rounded border border-zinc-400/10">
                              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-zinc-300" />
                              <span>
                                <strong>Recommendation:</strong> {decision.recommendation}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border border-white/10 rounded-2xl bg-[#101012]/90 p-6 space-y-4">
                      <h3 className="text-sm font-black text-white uppercase tracking-wider font-display border-b border-white/5 pb-3">
                        Complete Technical Architecture
                      </h3>
                      <div className="space-y-1">
                        {renderArchitectureMarkdown(dna.architecture)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === "phases" && dna && (
            <motion.div
              key="phases"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <span className="text-[10px] tracking-[0.2em] uppercase font-black text-zinc-300 font-display">
                    Step 03 · Execution Map
                  </span>
                  <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1 font-display">
                    Phased Prompt Pack
                  </h1>
                  <p className="text-xs text-gray-400 mt-1">
                    Generate prompts individually or create the entire suite.
                  </p>
                </div>
                <button
                  onClick={handleGenerateAllMissing}
                  className="inline-flex items-center justify-center h-10 px-5 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-zinc-700 to-zinc-800 hover:from-zinc-400 hover:to-zinc-700 transition-all shadow-[0_8px_24px_rgba(255,255,255,0.3)] cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-2" />
                  Generate All Missing
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border border-white/10 bg-[#101012] p-4 rounded-xl text-center">
                  <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    Total Phases
                  </span>
                  <span className="text-2xl font-black text-white">{totalPrompts}</span>
                </div>
                <div className="border border-white/10 bg-[#101012] p-4 rounded-xl text-center">
                  <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    Ready
                  </span>
                  <span className="text-2xl font-black text-emerald-400">{completedPrompts}</span>
                </div>
                <div className="border border-white/10 bg-[#101012] p-4 rounded-xl text-center">
                  <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    Pending
                  </span>
                  <span className="text-2xl font-black text-zinc-300">
                    {totalPrompts - completedPrompts}
                  </span>
                </div>
                <div className="border border-white/10 bg-[#101012] p-4 rounded-xl text-center">
                  <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    Completion
                  </span>
                  <span className="text-2xl font-black text-zinc-300">{progressPercent}%</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {phases.map((phase) => (
                  <div
                    key={phase.id}
                    className={`border rounded-xl p-5 bg-[#101012]/90 backdrop-blur-xl flex flex-col justify-between transition-all ${phase.status === "completed" ? "border-emerald-500/20 shadow-[0_4px_16px_rgba(16,185,129,0.05)] bg-gradient-to-b from-[#101012] to-emerald-950/5" : phase.status === "generating" ? "border-zinc-400/40 animate-pulse bg-zinc-950/5" : "border-white/10"}`}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${phase.status === "completed" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" : phase.status === "generating" ? "bg-zinc-400/15 text-zinc-300 border border-zinc-400/20" : "bg-white/5 text-gray-400 border border-white/5"}`}
                        >
                          Phase {phase.number}
                        </span>
                        {phase.status === "completed" ? (
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                            <Check className="h-3 w-3" /> Ready
                          </span>
                        ) : phase.status === "generating" ? (
                          <span className="text-[10px] text-zinc-300 font-bold flex items-center gap-1.5">
                            <RefreshCw className="h-3 w-3 animate-spin" /> Coding...
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-sm font-extrabold text-white mb-1.5 tracking-tight font-display">
                        {phase.title}
                      </h3>
                      <p className="text-xs text-gray-400 leading-relaxed mb-4">
                        {phase.description}
                      </p>
                    </div>
                    <div className="pt-4 border-t border-white/5 flex gap-2">
                      {phase.generatedPrompt ? (
                        <>
                          <button
                            onClick={() => {
                              setActivePhaseId(phase.id);
                              setView("output");
                            }}
                            className="flex-1 inline-flex items-center justify-center h-8 rounded-lg text-[10px] font-black uppercase tracking-wider text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer"
                          >
                            <FileText className="h-3 w-3 mr-1.5" /> View
                          </button>
                          <button
                            onClick={() => handleGeneratePrompt(phase.id)}
                            disabled={generatingPhaseId !== null}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-all cursor-pointer"
                            title="Regenerate"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleGeneratePrompt(phase.id)}
                          disabled={generatingPhaseId !== null}
                          className="w-full inline-flex items-center justify-center h-8 rounded-lg text-[10px] font-black uppercase tracking-wider text-zinc-200 border border-zinc-400/20 bg-zinc-400/10 hover:bg-zinc-400/20 hover:border-zinc-400/30 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {phase.status === "generating" ? "Generating..." : "Generate Prompt"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {view === "output" && (
            <motion.div
              key="output"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <span className="text-[10px] tracking-[0.2em] uppercase font-black text-zinc-300 font-display">
                    Step 04 · Ready for Lovable
                  </span>
                  <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1 font-display">
                    Phase {phases.find((p) => p.id === activePhaseId)?.number} Prompt Output
                  </h1>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <p className="text-xs text-gray-400">
                      Copy and paste into your Lovable editor.
                    </p>
                    {(() => {
                      const ap = phases.find((p) => p.id === activePhaseId);
                      if (!ap?.generatedPrompt) return null;
                      if (ap.source === "fallback") {
                        return (
                          <span
                            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20"
                            title="AI call did not return a prompt — this is a deterministic template built from your DNA. Check credits or retry."
                          >
                            Template fallback
                          </span>
                        );
                      }
                      if (ap.source === "ai") {
                        return (
                          <span
                            className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                            title={ap.model ? `Generated by ${ap.model}` : "Generated by AI"}
                          >
                            AI generated{ap.model ? ` · ${ap.model}` : ""}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleCopyPrompt}
                    className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-xs font-black tracking-wider uppercase text-white bg-zinc-700 hover:bg-zinc-400 transition-all shadow-[0_8px_24px_rgba(255,255,255,0.2)] cursor-pointer"
                  >
                    {copiedId ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-2" />
                        Copy Prompt
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleSendToCanvas}
                    className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-xs font-bold text-zinc-200 border border-zinc-400/20 bg-zinc-400/10 hover:bg-zinc-400/20 transition-all cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5 mr-2" />
                    Push to Canvas
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-3 border border-white/10 rounded-2xl bg-[#101012]/90 backdrop-blur-xl p-4 space-y-2 h-[calc(100vh-280px)] overflow-y-auto">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2 px-1">
                    Phase Index
                  </span>
                  {phases.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (p.generatedPrompt) setActivePhaseId(p.id);
                        else showToast(`Phase ${p.number} not yet generated.`);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-all ${!p.generatedPrompt ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} ${activePhaseId === p.id ? "bg-zinc-400/10 border border-zinc-400/20 text-white font-bold" : "text-gray-400 hover:text-white hover:bg-white/5 border border-transparent"}`}
                    >
                      <span className="truncate pr-2">
                        {p.number} · {p.title}
                      </span>
                      {p.generatedPrompt && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="lg:col-span-9">
                  <div className="border border-white/10 rounded-2xl bg-[#090a0f] p-5 relative">
                    <div className="absolute top-4 right-4 flex items-center gap-1 bg-white/5 rounded-md border border-white/5 p-0.5">
                      <button
                        onClick={() => setOutputMode("rendered")}
                        className={`px-2.5 py-1 text-[10px] font-bold font-mono uppercase rounded transition-all cursor-pointer ${outputMode === "rendered" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
                      >
                        Rendered
                      </button>
                      <button
                        onClick={() => setOutputMode("raw")}
                        className={`px-2.5 py-1 text-[10px] font-bold font-mono uppercase rounded transition-all cursor-pointer ${outputMode === "raw" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
                      >
                        Raw MD
                      </button>
                    </div>
                    {(() => {
                      const md = phases.find((p) => p.id === activePhaseId)?.generatedPrompt;
                      if (!md) {
                        return (
                          <div className="text-xs text-gray-500 h-[calc(100vh-320px)] flex items-center justify-center">
                            Select a generated phase prompt.
                          </div>
                        );
                      }
                      if (outputMode === "raw") {
                        return (
                          <pre className="text-xs text-gray-300 font-mono overflow-auto whitespace-pre-wrap leading-relaxed h-[calc(100vh-320px)] pr-2 pt-8 select-all">
                            {md}
                          </pre>
                        );
                      }
                      return (
                        <div className="overflow-auto h-[calc(100vh-320px)] pr-3 pt-8 prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:tracking-tight prose-h1:text-xl prose-h1:font-black prose-h1:text-white prose-h2:text-base prose-h2:font-bold prose-h2:text-white prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-1.5 prose-h2:mt-6 prose-h3:text-sm prose-h3:font-semibold prose-h3:text-zinc-200 prose-p:text-xs prose-p:text-gray-300 prose-p:leading-relaxed prose-li:text-xs prose-li:text-gray-300 prose-li:my-0.5 prose-strong:text-white prose-strong:font-semibold prose-code:text-[11px] prose-code:text-emerald-300 prose-code:bg-white/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-black/60 prose-pre:border prose-pre:border-white/10 prose-pre:text-[11px] prose-a:text-zinc-300 prose-hr:border-white/10">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === "canvas" && (
            <motion.div
              key="canvas"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <span className="text-[10px] tracking-[0.2em] uppercase font-black text-zinc-300 font-display">
                    Step 05 · Canvas Output
                  </span>
                  <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1 font-display">
                    Canvas Output Workspace
                  </h1>
                  <p className="text-xs text-gray-400 mt-1">
                    Historical log of all pushed phase prompts.
                  </p>
                </div>
                {canvasOutputs.length > 0 && (
                  <button
                    onClick={handleClearCanvas}
                    className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-xs font-bold text-red-400 border border-red-500/10 bg-red-500/5 hover:bg-red-500/10 transition-all cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Clear History
                  </button>
                )}
              </div>

              {canvasOutputs.length === 0 ? (
                <div className="border border-dashed border-white/10 rounded-2xl p-16 text-center space-y-4">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 border border-white/5 text-gray-500">
                    <Send className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white font-display">
                      Canvas Workspace Empty
                    </h3>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1 leading-relaxed">
                      Push prompts here from the output view to compile your permanent development
                      suite.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {canvasOutputs.map((item, index) => (
                    <div
                      key={index}
                      className="border border-white/10 rounded-2xl bg-[#101012]/90 overflow-hidden shadow-xl"
                    >
                      <div className="px-5 py-4 border-b border-white/5 bg-white/2 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-zinc-300" />
                          <h3 className="text-sm font-extrabold text-white font-display">
                            {item.title}
                          </h3>
                        </div>
                        <span className="text-[10px] text-gray-500 font-bold font-mono">
                          Pushed at {item.timestamp}
                        </span>
                      </div>
                      <div className="p-5 bg-black/40">
                        <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed pr-2 select-all">
                          {item.content}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {view === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <div>
                <span className="text-[10px] tracking-[0.2em] uppercase font-black text-zinc-300 font-display">
                  Step 06 · Application Parameters
                </span>
                <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1 font-display">
                  Settings
                </h1>
                <p className="text-xs text-gray-400 mt-1">
                  Control generation preferences and browser cache.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="border border-white/10 rounded-2xl bg-[#101012]/90 backdrop-blur-xl p-6 space-y-5">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider font-display border-b border-white/5 pb-3">
                    Generation Parameters
                  </h3>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-300 mb-2">
                      Prompt Detail Depth
                    </label>
                    <select
                      value={depth}
                      onChange={(e) => setDepth(e.target.value)}
                      className="w-full h-11 px-3 bg-[#050506] border border-white/5 rounded-xl outline-none focus:border-zinc-400 text-sm text-gray-300 font-medium"
                    >
                      <option value="balanced">Balanced — Compact and responsive</option>
                      <option value="deep">Deep — Detailed schemas & flows</option>
                      <option value="maximum">Maximum — Extreme precision</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-300 mb-2">
                      Preferred Tech Stack
                    </label>
                    <select
                      value={stack}
                      onChange={(e) => setStack(e.target.value)}
                      className="w-full h-11 px-3 bg-[#050506] border border-white/5 rounded-xl outline-none focus:border-zinc-400 text-sm text-gray-300 font-medium"
                    >
                      <option>
                        Lovable defaults with React, TypeScript, Tailwind and Supabase
                      </option>
                      <option>Pure Client-side React with LocalStorage</option>
                      <option>Drizzle ORM + Express + PostgreSQL with row-level security</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-300 mb-2">
                      Motion Intensity
                    </label>
                    <select
                      value={motionIntensity}
                      onChange={(e) => setMotionIntensity(e.target.value)}
                      className="w-full h-11 px-3 bg-[#050506] border border-white/5 rounded-xl outline-none focus:border-zinc-400 text-sm text-gray-300 font-medium"
                    >
                      <option value="minimal">Minimal — Subtle transitions</option>
                      <option value="refined">Refined — Professional easing</option>
                      <option value="expressive">Expressive — Fluid gestures</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-gray-300 mb-2">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-zinc-300" /> AI Model
                      </span>
                      <span className="text-[9px] text-gray-500 normal-case font-semibold tracking-normal">
                        Used for Analyze, Autowrite & Phase prompts
                      </span>
                    </label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value as ModelSelection)}
                      className="w-full h-11 px-3 bg-[#050506] border border-white/5 rounded-xl outline-none focus:border-zinc-400 text-sm text-gray-300 font-medium"
                    >
                      <option value="auto">✨ Auto — Cost-optimized (Gemini Flash)</option>
                      {AVAILABLE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} — {m.tag}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                      {model === "auto"
                        ? `Auto currently routes every task (Analyze, Phase, Autowrite) to ${autoModelFor("phase")} — the cheapest model on the gateway. Pick a stronger model above for higher-quality reasoning.`
                        : AVAILABLE_MODELS.find((m) => m.id === model)?.hint}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      saveToLocal(dna, phases, canvasOutputs);
                      showToast("Settings saved locally.");
                    }}
                    className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-xs font-bold text-zinc-200 border border-zinc-400/20 bg-zinc-400/10 hover:bg-zinc-400/20 transition-all cursor-pointer"
                  >
                    Save Settings
                  </button>
                </div>

                <div className="border border-white/10 rounded-2xl bg-[#101012]/90 backdrop-blur-xl p-6 space-y-5">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider font-display border-b border-white/5 pb-3 flex items-center justify-between">
                    <span>AI Engine</span>
                    <span className="text-[10px] bg-zinc-400/10 border border-zinc-400/20 text-zinc-300 font-black px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Secured
                    </span>
                  </h3>

                  <div className="p-4 border border-zinc-400/10 bg-zinc-400/5 rounded-xl text-xs text-zinc-200 leading-relaxed">
                    <strong>Powered by Lovable AI.</strong> All model calls run server-side through
                    the built-in Lovable AI Gateway. No API keys required — usage draws from your
                    Lovable workspace credits.
                  </div>

                  <div className="text-xs text-gray-400 leading-relaxed space-y-1">
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span>Model</span>
                      <span className="text-white font-mono">google/gemini-3.1-pro-preview</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 py-1.5">
                      <span>Provider</span>
                      <span className="text-white">Lovable AI Gateway</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5 space-y-3">
                    <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">
                      Browser Memory
                    </span>
                    <button
                      onClick={() => {
                        if (confirm("Clear all locally stored Project DNA and prompts?")) {
                          localStorage.clear();
                          setDna(null);
                          setPhases(DEFAULT_PHASES);
                          setCanvasOutputs([]);
                          showToast("Browser memory purged.");
                        }
                      }}
                      className="inline-flex items-center justify-center h-10 px-4 rounded-xl text-xs font-bold text-red-400 border border-red-500/10 bg-red-500/5 hover:bg-red-500/10 transition-all cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Clear Local Cache
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <div
        className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border border-emerald-500/20 bg-[#0c1f19]/95 text-[#c8ffe9] text-xs font-bold shadow-2xl flex items-center gap-2.5 transition-all duration-300 pointer-events-none transform ${toast.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
