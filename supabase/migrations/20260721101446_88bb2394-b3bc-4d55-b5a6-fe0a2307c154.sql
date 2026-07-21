-- ai_allowlist: gates all AI-invoking paths during closed beta
CREATE TABLE public.ai_allowlist (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_allowlist TO service_role;
-- authenticated intentionally receives NO grants; membership is checked via has_ai_access()

ALTER TABLE public.ai_allowlist ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon. Only service_role (which bypasses RLS) can touch this table.

-- has_ai_access: SECURITY DEFINER, callable by authenticated users to check any user's access,
-- but in practice server code always passes auth.uid().
CREATE OR REPLACE FUNCTION public.has_ai_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ai_allowlist WHERE user_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.has_ai_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_ai_access(uuid) TO authenticated, service_role;