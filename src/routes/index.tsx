import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Elite Canvas — AI Product Architecture Studio" },
      {
        name: "description",
        content:
          "Elite Canvas turns raw product ideas into structured Project DNA and a 15-phase Lovable prompt pack. Closed beta.",
      },
      { property: "og:title", content: "Elite Canvas — AI Product Architecture Studio" },
      {
        property: "og:description",
        content:
          "Turn raw product ideas into Project DNA and a 15-phase Lovable prompt pack.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        navigate({ to: "/app", replace: true });
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  if (checking) {
    return <div className="min-h-screen bg-black" aria-hidden />;
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center gap-2 text-white/70 mb-6">
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-medium tracking-wide">Elite Canvas</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
          AI Product Architecture Studio
        </h1>
        <p className="text-white/50 text-sm sm:text-base mb-8">
          Sign in to open your workspace.
        </p>
        <Link
          to="/auth"
          className="inline-flex h-11 px-6 items-center justify-center rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90"
        >
          Sign in
        </Link>
        <p className="mt-6 text-[11px] text-white/30">
          Closed beta. AI generation requires an access grant.
        </p>
      </div>
    </div>
  );
}
