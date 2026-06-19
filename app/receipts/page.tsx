"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { fmtDate, fmtEur } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import type { Transaction } from "@/lib/types";

type ParsedReceipt = {
  merchant: string;
  date: string | null;
  total: number | null;
  currency: string;
  category: string | null;
  items: Array<{ name: string; price: number }>;
};

type UploadResult = { parsed: ParsedReceipt; transaction: Transaction; created: boolean };

type ReceiptRow = {
  id: string;
  merchant: string;
  total: number | null;
  currency: string;
  created_at: string;
  transaction_id: string | null;
  tx_date: string | null;
  tx_amount: number | null;
  category_name: string | null;
  category_icon: string | null;
};

export default function ReceiptsPage() {
  return (
    <Suspense>
      <ReceiptsContent />
    </Suspense>
  );
}

function ReceiptsContent() {
  const t = useT();
  const { tCat } = useI18n();
  const searchParams = useSearchParams();
  const linkedTx = searchParams.get("tx");
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/finance/api/receipts");
    if (res.ok) setReceipts(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t({ fr: "Reçus", en: "Receipts" })}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t({
            fr: "Téléversez une photo ou un PDF de ticket. L'IA le lit, puis l'associe à la transaction bancaire correspondante ou crée une nouvelle dépense catégorisée.",
            en: "Upload a photo or PDF of a ticket. AI reads it, then attaches it to the matching bank transaction or creates a new categorized expense.",
          })}
        </p>
      </div>

      {linkedTx && (
        <div className="card py-3 text-sm text-slate-300">
          {t({
            fr: "Ajout d'un reçu pour une transaction issue de votre notification. Téléversez-le ci-dessous — si le montant et la date correspondent, il sera associé automatiquement.",
            en: "Adding a receipt for a transaction from your notification. Upload it below — if the amount and date match, it will be attached automatically.",
          })}
        </div>
      )}

      <UploadForm onUploaded={load} />

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">{t({ fr: "Reçus récents", en: "Recent receipts" })}</h2>
        {receipts.length === 0 ? (
          <p className="text-sm text-slate-500">{t({ fr: "Aucun reçu pour l'instant.", en: "No receipts yet." })}</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-slate-200">{r.merchant || t({ fr: "Reçu", en: "Receipt" })}</div>
                  <div className="text-xs text-slate-500">
                    {r.tx_date ? fmtDate(r.tx_date) : fmtDate(r.created_at.slice(0, 10))}
                    {r.category_name && (
                      <> · {r.category_icon} {tCat(r.category_name)}</>
                    )}
                    {r.transaction_id && (
                      <> · <Link className="text-emerald-400 underline" href="/transactions">{t({ fr: "voir la transaction", en: "view transaction" })}</Link></>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-medium text-slate-300">
                    {r.total != null ? fmtEur(-Math.abs(r.total)) : "—"}
                  </span>
                  <a
                    className="text-xs text-slate-500 underline hover:text-slate-300"
                    href={`/finance/api/receipts/${r.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t({ fr: "fichier", en: "file" })}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const t = useT();
  const { tCat } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/finance/api/receipts", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t({ fr: "Échec du téléversement", en: "Upload failed" }));
        return;
      }
      setResult(data);
      onUploaded();
    } catch {
      setError(t({ fr: "Échec du téléversement", en: "Upload failed" }));
    } finally {
      setLoading(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }

  return (
    <div className="card space-y-3">
      <div
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition-colors ${
          dragging ? "border-emerald-500 bg-emerald-950/20" : "border-slate-700 hover:border-slate-500"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="text-2xl">{loading ? "⏳" : "🧾"}</span>
        <p className="text-sm text-slate-400">
          {loading ? t({ fr: "Lecture du reçu…", en: "Reading receipt…" }) : t({ fr: "Déposez une photo ou un PDF de reçu ici, ou cliquez pour parcourir", en: "Drop a receipt photo or PDF here, or click to browse" })}
        </p>
        <p className="text-xs text-slate-600">{t({ fr: "JPG, PNG ou PDF — max 10 Mo", en: "JPG, PNG or PDF — max 10 MB" })}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={onFile}
          disabled={loading}
        />
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {result && (
        <div className="space-y-2 rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4 text-sm">
          <p className="font-medium text-emerald-300">
            {result.created ? t({ fr: "Nouvelle dépense créée", en: "New expense created" }) : t({ fr: "Associé à une transaction existante", en: "Attached to existing transaction" })}
          </p>
          <div className="text-slate-300">
            <span className="font-medium">{result.parsed.merchant || t({ fr: "Reçu", en: "Receipt" })}</span>
            {result.parsed.total != null && <> · {fmtEur(-Math.abs(result.parsed.total))}</>}
            {result.transaction.date && <> · {fmtDate(result.transaction.date)}</>}
            {result.transaction.category_name && (
              <> · {result.transaction.category_icon} {tCat(result.transaction.category_name)}</>
            )}
          </div>
          {result.parsed.items.length > 0 && (
            <ul className="text-xs text-slate-500">
              {result.parsed.items.slice(0, 8).map((it, i) => (
                <li key={i} className="flex justify-between">
                  <span className="truncate">{it.name}</span>
                  <span>{fmtEur(-Math.abs(it.price))}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/transactions" className="inline-block text-emerald-400 underline">
            {t({ fr: "Voir dans les transactions", en: "View in transactions" })} →
          </Link>
        </div>
      )}
    </div>
  );
}
