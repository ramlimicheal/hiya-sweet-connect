import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Elite Canvas" },
      {
        name: "description",
        content: "Sign in to Elite Canvas, an AI Product Architecture Studio.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (result.error) {
        setError("Google sign-in failed. Please try again.");
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/app", replace: true });
    } catch {
      setError("Google sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="flex items-center gap-2 justify-center mb-8 text-white/80 hover:text-white"
        >
          <Sparkles className="w-5 h-5" />
          <span className="font-medium">Elite Canvas</span>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h1 className="text-xl font-semibold mb-1">Sign in</h1>
          <p className="text-sm text-white/50 mb-6">
            AI Product Architecture Studio
          </p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="w-full h-11 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 disabled:opacity-50 transition"
          >
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>

          {error && (
            <p className="mt-3 text-xs text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] text-white/30">
          By signing in you agree to the terms of use.
          <br />
          25 AI generations per day (resets at 00:00 UTC), per account.
        </p>
      </div>
    </div>
  );
}
