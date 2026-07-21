-- ai_usage_daily: per-user per-UTC-day AI call counter
CREATE TABLE public.ai_usage_daily (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  calls integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

GRANT SELECT ON public.ai_usage_daily TO authenticated;
GRANT ALL ON public.ai_usage_daily TO service_role;

ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
  ON public.ai_usage_daily
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- consume_ai_call: atomic increment + cap check
CREATE OR REPLACE FUNCTION public.consume_ai_call(_user_id uuid, _limit integer DEFAULT 100)
RETURNS TABLE (allowed boolean, used integer, remaining integer, day_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  current_calls integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  INSERT INTO public.ai_usage_daily (user_id, usage_date, calls, updated_at)
    VALUES (_user_id, today, 0, now())
    ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT calls INTO current_calls
    FROM public.ai_usage_daily
    WHERE user_id = _user_id AND usage_date = today
    FOR UPDATE;

  IF current_calls >= _limit THEN
    RETURN QUERY SELECT false, current_calls, 0, _limit;
    RETURN;
  END IF;

  UPDATE public.ai_usage_daily
    SET calls = calls + 1, updated_at = now()
    WHERE user_id = _user_id AND usage_date = today
    RETURNING calls INTO current_calls;

  RETURN QUERY SELECT true, current_calls, GREATEST(_limit - current_calls, 0), _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_call(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ai_call(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_call(uuid, integer) TO service_role;

-- Read-only helper for the UI
CREATE OR REPLACE FUNCTION public.get_ai_usage_today(_user_id uuid, _limit integer DEFAULT 100)
RETURNS TABLE (used integer, remaining integer, day_limit integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(u.calls, 0) AS used,
    GREATEST(_limit - COALESCE(u.calls, 0), 0) AS remaining,
    _limit AS day_limit
  FROM (SELECT 1) x
  LEFT JOIN public.ai_usage_daily u
    ON u.user_id = _user_id
   AND u.usage_date = (now() AT TIME ZONE 'UTC')::date;
$$;

REVOKE ALL ON FUNCTION public.get_ai_usage_today(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_today(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_usage_today(uuid, integer) TO service_role;