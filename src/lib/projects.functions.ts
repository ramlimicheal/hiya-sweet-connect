import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ProjectSnapshot } from "@/lib/projects";

const ProjectPayload = z.object({
  id: z.string().uuid(),
  name: z.string().max(200),
  idea: z.string(),
  productType: z.string(),
  stage: z.string(),
  constraints: z.string(),
  references: z.string(),
  dna: z.any().nullable(),
  phases: z.array(z.any()),
  canvasOutputs: z.array(z.any()),
  createdAt: z.number(),
  updatedAt: z.number(),
});

type Row = {
  id: string;
  name: string;
  idea: string;
  product_type: string;
  stage: string;
  constraints: string;
  refs: string;
  dna: unknown;
  phases: unknown;
  canvas_outputs: unknown;
  created_at: string;
  updated_at: string;
};

function rowToSnapshot(r: Row): ProjectSnapshot {
  return {
    id: r.id,
    name: r.name,
    idea: r.idea ?? "",
    productType: r.product_type ?? "Automatically determine",
    stage: r.stage ?? "New application",
    constraints: r.constraints ?? "",
    references: r.refs ?? "",
    dna: (r.dna as ProjectSnapshot["dna"]) ?? null,
    phases: Array.isArray(r.phases) ? (r.phases as ProjectSnapshot["phases"]) : [],
    canvasOutputs: Array.isArray(r.canvas_outputs)
      ? (r.canvas_outputs as ProjectSnapshot["canvasOutputs"])
      : [],
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
  };
}

export const listCloudProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select(
        "id,name,idea,product_type,stage,constraints,refs,dna,phases,canvas_outputs,created_at,updated_at",
      )
      .eq("archived", false)
      .order("updated_at", { ascending: false });
    if (error) throw new Error("list_failed");
    return (data as Row[]).map(rowToSnapshot);
  });

export const upsertCloudProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProjectPayload.parse(input))
  .handler(async ({ data, context }) => {
    const row = {
      id: data.id,
      owner_id: context.userId,
      name: data.name,
      idea: data.idea,
      product_type: data.productType,
      stage: data.stage,
      constraints: data.constraints,
      refs: data.references,
      dna: data.dna,
      phases: data.phases,
      canvas_outputs: data.canvasOutputs,
      archived: false,
      updated_at: new Date(data.updatedAt).toISOString(),
    };
    const { error } = await context.supabase.from("projects").upsert(row, { onConflict: "id" });
    if (error) throw new Error("upsert_failed");
    return { ok: true };
  });

export const deleteCloudProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error("delete_failed");
    return { ok: true };
  });
