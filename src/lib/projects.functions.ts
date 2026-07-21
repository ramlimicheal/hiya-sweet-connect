import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SnapshotInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  idea: z.string().default(""),
  productType: z.string().default("Automatically determine"),
  stage: z.string().default("New application"),
  constraints: z.string().default(""),
  references: z.string().default(""),
  dna: z.any().nullable().optional(),
  phases: z.array(z.any()).default([]),
  canvasOutputs: z.array(z.any()).default([]),
});

export interface CloudProject {
  id: string;
  name: string;
  idea: string;
  productType: string;
  stage: string;
  constraints: string;
  references: string;
  dna: import("@/types").ProjectDNA | null;
  phases: import("@/types").BuildPhase[];
  canvasOutputs: Array<{ title: string; content: string; timestamp: string }>;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  name: string;
  idea: string;
  product_type: string;
  stage: string;
  constraints: string;
  refs: string;
  dna: import("@/types").ProjectDNA | null;
  phases: import("@/types").BuildPhase[];
  canvas_outputs: unknown[];
  archived: boolean;
  created_at: string;
  updated_at: string;
};

function fromRow(r: Row): CloudProject {
  return {
    id: r.id,
    name: r.name,
    idea: r.idea,
    productType: r.product_type,
    stage: r.stage,
    constraints: r.constraints,
    references: r.refs,
    dna: r.dna,
    phases: r.phases ?? [],
    canvasOutputs: r.canvas_outputs ?? [],
    archived: r.archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CloudProject[]> => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("*")
      .eq("archived", false)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as Row[]).map(fromRow);
  });

export const saveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SnapshotInput.parse(data))
  .handler(async ({ data, context }): Promise<CloudProject> => {
    const row = {
      owner_id: context.userId,
      name: data.name,
      idea: data.idea,
      product_type: data.productType,
      stage: data.stage,
      constraints: data.constraints,
      refs: data.references,
      dna: data.dna ?? null,
      phases: data.phases,
      canvas_outputs: data.canvasOutputs,
    };
    if (data.id) {
      const { data: updated, error } = await context.supabase
        .from("projects")
        .update(row)
        .eq("id", data.id)
        .eq("owner_id", context.userId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return fromRow(updated as Row);
    }
    const { data: inserted, error } = await context.supabase
      .from("projects")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return fromRow(inserted as Row);
  });

export const renameProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ name: data.name })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), archived: z.boolean().default(true) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .update({ archived: data.archived })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
