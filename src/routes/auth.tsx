import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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

  async function handleEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/auth" },
        });
        if (err) {
          setError(err.message);
        } else {
          setInfo("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          setError(err.message);
        } else {
          navigate({ to: "/app", replace: true });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8 text-white/80 hover:text-white">
          <Sparkles className="w-5 h-5" />
          <span className="font-medium">Elite Canvas</span>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h1 className="text-xl font-semibold mb-1">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
          <p className="text-sm text-white/50 mb-5">
            AI Product Architecture Studio
          </p>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="w-full h-10 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 disabled:opacity-50"
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-white/40">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-black border border-white/10 text-sm focus:border-white/30 outline-none"
            />
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder="Password (min 8 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-black border border-white/10 text-sm focus:border-white/30 outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full h-10 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15 text-sm font-medium disabled:opacity-50"
            >
              {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-xs text-red-400" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="mt-3 text-xs text-emerald-400" role="status">
              {info}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setInfo(null);
            }}
            className="mt-5 w-full text-xs text-white/50 hover:text-white/80"
          >
            {mode === "signin"
              ? "Need an account? Create one"
              : "Have an account? Sign in"}
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-white/30">
          Closed beta. AI generation requires an access grant.
        </p>
      </div>
    </div>
  );
}
