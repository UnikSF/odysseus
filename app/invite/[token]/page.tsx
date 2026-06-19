"use client";

import { Suspense, useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import type { Institution } from "@/lib/gocardless";
import { useT } from "@/lib/i18n";

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
  const t = useT();
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
        alert(data.error ?? t({ fr: "Échec de la connexion", en: "Connection failed" }));
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
            {t({ fr: "Connectez votre banque", en: "Connect your bank" })}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t({
              fr: "Vous avez été invité à consulter un aperçu de vos finances. Connectez votre banque pour obtenir des analyses — aucune donnée n'est enregistrée.",
              en: "You've been invited to view a snapshot of your finances. Connect your bank to get insights — no data is saved.",
            })}
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-800/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
            {error === "expired"
              ? t({
                  fr: "Ce lien d'invitation a expiré. Demandez-en un nouveau.",
                  en: "This invite link has expired. Ask for a new one.",
                })
              : t({
                  fr: "Un problème est survenu lors de la connexion à votre banque. Veuillez réessayer.",
                  en: "Something went wrong connecting your bank. Please try again.",
                })}
          </div>
        )}

        {loading && <p className="text-center text-sm text-slate-500">{t({ fr: "Chargement des banques…", en: "Loading banks…" })}</p>}

        {unavailable && (
          <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
            {t({ fr: "Ce lien d'invitation est invalide ou a expiré.", en: "This invite link is invalid or expired." })}
          </div>
        )}

        {!loading && !unavailable && (
          <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            {/* Featured banks */}
            {q === "" && featuredFiltered.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">{t({ fr: "Banques populaires", en: "Popular banks" })}</p>
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
              placeholder={t({ fr: "Rechercher une banque…", en: "Search banks…" })}
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
                <p className="col-span-2 py-2 text-sm text-slate-500">{t({ fr: "Aucune banque ne correspond à votre recherche.", en: "No banks match your search." })}</p>
              )}
            </div>

            <p className="text-xs text-slate-600">
              {t({
                fr: "Vous serez redirigé vers votre banque pour autoriser un accès PSD2 en lecture seule, puis ramené ici automatiquement. Rien n'est enregistré sur la machine hôte.",
                en: "You'll be redirected to your bank to authorize read-only PSD2 access, then brought back here automatically. Nothing is stored on the host machine.",
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
