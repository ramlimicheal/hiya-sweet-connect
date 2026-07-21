ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dna_v2 jsonb,
  ADD COLUMN IF NOT EXISTS architecture jsonb,
  ADD COLUMN IF NOT EXISTS decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checkpoints jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validation jsonb,
  ADD COLUMN IF NOT EXISTS input_kind text NOT NULL DEFAULT 'idea',
  ADD COLUMN IF NOT EXISTS repo_url text,
  ADD COLUMN IF NOT EXISTS repo_context jsonb;