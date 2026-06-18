"use client";

import { Suspense, useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import type { Institution } from "@/lib/gocardless";

const FEATURED = ["bnp", "revolut", "caisse d'épargne", "caisse d epargne", "caisse epargne"];
const isFeatured = (name: string) => FEATURED.some((f) => name.toLowerCase().includes(f));

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return (
    <Suspense>
      <InviteContent token={token} />
    </Suspense>
  );
}

function InviteContent({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [search, setSearch] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/finance/api/invite/${token}/institutions`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setInstitutions(d);
        else setUnavailable(true);
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function connect(inst: Institution) {
    setConnecting(inst.id);
    try {
      const res = await fetch(`/finance/api/invite/${token}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution_id: inst.id, institution_name: inst.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Connection failed");
        return;
      }
      window.location.href = data.link;
    } finally {
      setConnecting(null);
    }
  }

  const q = search.trim().toLowerCase();
  const featured = institutions.filter((i) => isFeatured(i.name));
  const rest = institutions.filter((i) => !isFeatured(i.name));
  const featuredFiltered = featured.filter((i) => q === "" || i.name.toLowerCase().includes(q));
  const restFiltered = rest.filter((i) => q === "" || i.name.toLowerCase().includes(q));
  const allFiltered = q !== "" ? [...featuredFiltered, ...restFiltered] : null;

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-950 px-4 pt-16">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="mb-2 text-3xl">💸</div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            Connect your bank
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            You&apos;ve been invited to view a snapshot of your finances. Connect your bank to get
            insights — no data is saved.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-800/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
            {error === "expired"
              ? "This invite link has expired. Ask for a new one."
              : "Something went wrong connecting your bank. Please try again."}
          </div>
        )}

        {loading && <p className="text-center text-sm text-slate-500">Loading banks…</p>}

        {unavailable && (
          <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
            This invite link is invalid or expired.
          </div>
        )}

        {!loading && !unavailable && (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            {/* Featured banks */}
            {q === "" && featuredFiltered.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">Popular banks</p>
                <div className="grid grid-cols-3 gap-2">
                  {featuredFiltered.map((inst) => (
                    <button
                      key={inst.id}
                      className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-3 text-left text-sm text-slate-200 transition-colors hover:border-emerald-600 disabled:opacity-50"
                      onClick={() => connect(inst)}
                      disabled={connecting !== null}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={inst.logo} alt="" className="h-7 w-7 shrink-0 rounded" />
                      <span className="truncate text-xs font-medium leading-tight">{inst.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search */}
            <input
              className="input w-full"
              placeholder="Search banks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {/* Other banks */}
            <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
              {(allFiltered ?? restFiltered).map((inst) => (
                <button
                  key={inst.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-sm text-slate-300 transition-colors hover:border-emerald-700 disabled:opacity-50"
                  onClick={() => connect(inst)}
                  disabled={connecting !== null}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={inst.logo} alt="" className="h-6 w-6 shrink-0 rounded" />
                  <span className="truncate">{inst.name}</span>
                </button>
              ))}
              {allFiltered?.length === 0 && (
                <p className="col-span-2 py-2 text-sm text-slate-500">No banks match your search.</p>
              )}
            </div>

            <p className="text-xs text-slate-600">
              You&apos;ll be redirected to your bank to authorize read-only PSD2 access, then
              brought back here automatically. Nothing is stored on the host machine.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
