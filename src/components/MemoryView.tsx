import { useState } from "react";
import { motion } from "motion/react";
import { Plus, Trash2, RotateCcw, CheckCircle2, XCircle, Clock, Link as LinkIcon, StickyNote, X } from "lucide-react";
import type { Decision, DnaSnapshot, Evidence } from "@/types";
import { newId } from "@/lib/projects";

interface Props {
  decisions: Decision[];
  setDecisions: React.Dispatch<React.SetStateAction<Decision[]>>;
  dnaHistory: DnaSnapshot[];
  onRestoreDna: (snap: DnaSnapshot) => void;
  showToast: (msg: string) => void;
}

type Tab = "decisions" | "history";

export function MemoryView({
  decisions,
  setDecisions,
  dnaHistory,
  onRestoreDna,
  showToast,
}: Props) {
  const [tab, setTab] = useState<Tab>("decisions");
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<Omit<Decision, "id" | "createdAt" | "updatedAt">>({
    title: "",
    context: "",
    options: "",
    chosen: "",
    rationale: "",
    status: "proposed",
  });

  const resetDraft = () => {
    setDraft({
      title: "",
      context: "",
      options: "",
      chosen: "",
      rationale: "",
      status: "proposed",
    });
    setDrafting(false);
  };

  const addDecision = () => {
    if (!draft.title.trim()) {
      showToast("Give the decision a title.");
      return;
    }
    const now = Date.now();
    setDecisions((prev) => [
      { ...draft, id: newId(), createdAt: now, updatedAt: now },
      ...prev,
    ]);
    resetDraft();
    showToast("Decision recorded.");
  };

  const setStatus = (id: string, status: Decision["status"]) => {
    setDecisions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status, updatedAt: Date.now() } : d)),
    );
  };

  const removeDecision = (id: string) => {
    if (!confirm("Delete this decision?")) return;
    setDecisions((prev) => prev.filter((d) => d.id !== id));
  };

  const addEvidence = (decisionId: string, ev: Omit<Evidence, "id" | "createdAt">) => {
    if (!ev.title.trim()) return;
    if (ev.kind === "url" && !ev.url?.trim()) return;
    const item: Evidence = { ...ev, id: newId(), createdAt: Date.now() };
    setDecisions((prev) =>
      prev.map((d) =>
        d.id === decisionId
          ? { ...d, evidence: [...(d.evidence ?? []), item], updatedAt: Date.now() }
          : d,
      ),
    );
  };

  const removeEvidence = (decisionId: string, evId: string) => {
    setDecisions((prev) =>
      prev.map((d) =>
        d.id === decisionId
          ? { ...d, evidence: (d.evidence ?? []).filter((e) => e.id !== evId), updatedAt: Date.now() }
          : d,
      ),
    );
  };

  return (
    <motion.div
      key="memory"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div>
        <span className="text-[10px] tracking-[0.2em] uppercase font-black text-zinc-300 font-display">
          Step 06 · Architecture Memory
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-white mt-1 font-display">
          Memory
        </h1>
        <p className="text-sm text-gray-400 mt-2 max-w-2xl">
          Persistent record of decisions and Project DNA versions. This is the
          audit trail your future self (and collaborators) will thank you for.
        </p>
      </div>

      <div className="flex gap-2 border-b border-white/10">
        {(
          [
            { id: "decisions", label: `Decisions (${decisions.length})` },
            { id: "history", label: `DNA History (${dnaHistory.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-bold transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "text-white border-zinc-300"
                : "text-gray-500 border-transparent hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "decisions" && (
        <div className="space-y-4">
          {!drafting ? (
            <button
              onClick={() => setDrafting(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-black text-xs font-bold hover:bg-gray-200 transition"
            >
              <Plus className="h-4 w-4" /> Record decision
            </button>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Title (e.g. Choose Postgres over MongoDB)"
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-zinc-400"
              />
              <textarea
                value={draft.context}
                onChange={(e) => setDraft({ ...draft, context: e.target.value })}
                placeholder="Context: what problem are you solving?"
                rows={2}
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-zinc-400 resize-none"
              />
              <textarea
                value={draft.options}
                onChange={(e) => setDraft({ ...draft, options: e.target.value })}
                placeholder="Options considered"
                rows={2}
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-zinc-400 resize-none"
              />
              <input
                value={draft.chosen}
                onChange={(e) => setDraft({ ...draft, chosen: e.target.value })}
                placeholder="Chosen option"
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-zinc-400"
              />
              <textarea
                value={draft.rationale}
                onChange={(e) => setDraft({ ...draft, rationale: e.target.value })}
                placeholder="Rationale: why this option?"
                rows={2}
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-zinc-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={addDecision}
                  className="px-3 py-2 rounded-lg bg-white text-black text-xs font-bold hover:bg-gray-200"
                >
                  Save decision
                </button>
                <button
                  onClick={resetDraft}
                  className="px-3 py-2 rounded-lg border border-white/10 text-gray-300 text-xs font-bold hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {decisions.length === 0 && !drafting && (
            <div className="text-sm text-gray-500 italic">
              No decisions yet. Every serious architecture choice deserves a paper trail.
            </div>
          )}

          <div className="space-y-3">
            {decisions.map((d) => (
              <div
                key={d.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">{d.title}</h3>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {new Date(d.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                      d.status === "accepted"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : d.status === "rejected"
                          ? "bg-red-500/20 text-red-300"
                          : d.status === "superseded"
                            ? "bg-gray-500/20 text-gray-400"
                            : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {d.status}
                  </span>
                </div>
                {d.context && (
                  <p className="text-xs text-gray-400">
                    <span className="text-gray-500 font-bold">Context:</span> {d.context}
                  </p>
                )}
                {d.options && (
                  <p className="text-xs text-gray-400">
                    <span className="text-gray-500 font-bold">Options:</span> {d.options}
                  </p>
                )}
                {d.chosen && (
                  <p className="text-xs text-gray-300">
                    <span className="text-gray-500 font-bold">Chosen:</span> {d.chosen}
                  </p>
                )}
                {d.rationale && (
                  <p className="text-xs text-gray-400">
                    <span className="text-gray-500 font-bold">Rationale:</span> {d.rationale}
                  </p>
                )}
                <EvidenceBlock
                  items={d.evidence ?? []}
                  onAdd={(ev) => addEvidence(d.id, ev)}
                  onRemove={(evId) => removeEvidence(d.id, evId)}
                />
                <div className="flex gap-2 pt-2 border-t border-white/5">
                  {d.status !== "accepted" && (
                    <button
                      onClick={() => setStatus(d.id, "accepted")}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/10"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Accept
                    </button>
                  )}
                  {d.status !== "rejected" && (
                    <button
                      onClick={() => setStatus(d.id, "rejected")}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-red-300 hover:bg-red-500/10"
                    >
                      <XCircle className="h-3 w-3" /> Reject
                    </button>
                  )}
                  {d.status !== "superseded" && (
                    <button
                      onClick={() => setStatus(d.id, "superseded")}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-gray-400 hover:bg-white/5"
                    >
                      <Clock className="h-3 w-3" /> Supersede
                    </button>
                  )}
                  <button
                    onClick={() => removeDecision(d.id)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-gray-500 hover:bg-white/5 ml-auto"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          {dnaHistory.length === 0 && (
            <div className="text-sm text-gray-500 italic">
              No DNA versions yet. Analyze an idea or edit the current DNA to create the first snapshot.
            </div>
          )}
          {[...dnaHistory].reverse().map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-zinc-300">v{s.version}</span>
                  <span className="text-sm text-white font-semibold truncate">
                    {s.dna.projectName}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1">
                  {new Date(s.createdAt).toLocaleString()} · {s.note}
                </div>
                <p className="text-xs text-gray-400 mt-2 line-clamp-2">{s.dna.summary}</p>
              </div>
              <button
                onClick={() => onRestoreDna(s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold text-gray-200 hover:bg-white/5 shrink-0"
              >
                <RotateCcw className="h-3 w-3" /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

interface EvidenceBlockProps {
  items: Evidence[];
  onAdd: (ev: Omit<Evidence, "id" | "createdAt">) => void;
  onRemove: (id: string) => void;
}

function EvidenceBlock({ items, onAdd, onRemove }: EvidenceBlockProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"url" | "note">("url");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");

  const reset = () => {
    setTitle("");
    setUrl("");
    setNote("");
    setKind("url");
    setOpen(false);
  };

  const submit = () => {
    if (!title.trim()) return;
    if (kind === "url" && !url.trim()) return;
    onAdd({ kind, title: title.trim(), url: url.trim() || undefined, note: note.trim() || undefined });
    reset();
  };

  return (
    <div className="pt-2 border-t border-white/5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
          Evidence ({items.length})
        </span>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-gray-300 hover:bg-white/5"
          >
            <Plus className="h-3 w-3" /> Cite
          </button>
        )}
      </div>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-2 text-xs text-gray-300 bg-white/[0.02] border border-white/5 rounded px-2 py-1.5"
            >
              {e.kind === "url" ? (
                <LinkIcon className="h-3 w-3 mt-0.5 text-sky-300 shrink-0" />
              ) : (
                <StickyNote className="h-3 w-3 mt-0.5 text-amber-300 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {e.kind === "url" && e.url ? (
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-300 hover:underline font-medium break-all"
                  >
                    {e.title}
                  </a>
                ) : (
                  <span className="font-medium text-white">{e.title}</span>
                )}
                {e.note && <div className="text-gray-400 mt-0.5">{e.note}</div>}
              </div>
              <button
                onClick={() => onRemove(e.id)}
                className="text-gray-500 hover:text-red-300 shrink-0"
                aria-label="Remove evidence"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="rounded-lg border border-white/10 bg-black/40 p-2 space-y-2">
          <div className="flex gap-1">
            {(["url", "note"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                  kind === k
                    ? "bg-white text-black"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {k === "url" ? <LinkIcon className="h-3 w-3" /> : <StickyNote className="h-3 w-3" />}
                {k}
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "url" ? "Source label (e.g. Stripe docs)" : "Note title"}
            className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-zinc-400"
          />
          {kind === "url" ? (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-zinc-400"
            />
          ) : (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Snippet, quote, or reasoning"
              rows={2}
              className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-zinc-400 resize-none"
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={submit}
              className="px-2 py-1 rounded bg-white text-black text-[10px] font-bold hover:bg-gray-200"
            >
              Add citation
            </button>
            <button
              onClick={reset}
              className="px-2 py-1 rounded border border-white/10 text-gray-300 text-[10px] font-bold hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
